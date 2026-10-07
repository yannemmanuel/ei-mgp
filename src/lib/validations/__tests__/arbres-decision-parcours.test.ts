import { describe, expect, it } from 'vitest'
import { schemaParcours } from '../formulaire-parcours'
import { PARCOURS } from '@/server/services/declaration/parcours-config'
import type { ParcoursCode } from '@/server/authz'

const HIER = '2026-09-01T10:00'

const commun = {
  categorieId: '1',
  description: 'Description factuelle des faits.',
  caractereRepetitif: 'premiere_fois',
}

const valides: Record<ParcoursCode, Record<string, unknown>> = {
  ei_employe: {
    ...commun,
    matricule: 'M-123',
    declarantEstVictime: true,
    directionId: '1',
    dateSurvenance: HIER,
    lieu: 'Atelier central',
  },
  grief_employe: {
    ...commun,
    matricule: 'M-123',
    declarantEstVictime: true,
    directionId: '1',
    dateHeureFaits: HIER,
    lieu: 'Atelier central',
  },
  grief_sous_traitant: {
    ...commun,
    consentementRgpd: true,
    entreprise: 'Entreprise partenaire',
    nomPrenom: 'Awa Koffi',
    dateHeureFaits: HIER,
    lieuSite: 'Atelier central',
  },
  grief_communaute: {
    ...commun,
    nomPrenom: 'Awa Koffi',
    ville: 'Abidjan',
    statutPlaignant: 'riverain',
    dateSurvenance: HIER,
    lieu: 'Quartier Nord',
  },
}

function analyser(
  parcours: ParcoursCode,
  anonyme: boolean,
  surcharge: Record<string, unknown> = {}
) {
  return schemaParcours(PARCOURS[parcours], anonyme).safeParse({
    ...valides[parcours],
    anonymat: anonyme,
    ...surcharge,
  })
}

function sans(parcours: ParcoursCode, ...champs: string[]) {
  const valeur = { ...valides[parcours] }
  for (const champ of champs) delete valeur[champ]
  return valeur
}

describe('Arbre de décision — identité et anonymat des quatre parcours', () => {
  it.each([
    ['ei_employe', 'matricule'],
    ['grief_employe', 'matricule'],
    ['grief_sous_traitant', 'nomPrenom'],
    ['grief_communaute', 'nomPrenom'],
  ] as const)('refuse %s identifié sans %s', (parcours, champ) => {
    const r = schemaParcours(PARCOURS[parcours], false).safeParse({
      ...sans(parcours, champ),
      anonymat: false,
    })

    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(champ)
  })

  it.each([
    ['ei_employe', 'matricule'],
    ['grief_employe', 'matricule'],
    ['grief_sous_traitant', 'nomPrenom'],
    ['grief_communaute', 'nomPrenom'],
  ] as const)('accepte %s anonyme sans %s', (parcours, champ) => {
    const donnees = sans(parcours, champ)
    if (parcours === 'grief_sous_traitant') delete donnees.consentementRgpd

    expect(
      schemaParcours(PARCOURS[parcours], true).safeParse({ ...donnees, anonymat: true }).success
    ).toBe(true)
  })

  it('exige toujours l’entreprise du sous-traitant, même en anonyme', () => {
    const r = schemaParcours(PARCOURS.grief_sous_traitant, true).safeParse({
      ...sans('grief_sous_traitant', 'entreprise', 'nomPrenom', 'consentementRgpd'),
      anonymat: true,
    })

    expect(r.success).toBe(false)
  })

  it('exige le consentement seulement pour le sous-traitant identifié', () => {
    expect(analyser('grief_sous_traitant', false, { consentementRgpd: false }).success).toBe(false)
    expect(
      schemaParcours(PARCOURS.grief_sous_traitant, true).safeParse({
        ...sans('grief_sous_traitant', 'nomPrenom', 'consentementRgpd'),
        anonymat: true,
      }).success
    ).toBe(true)
  })
})

describe('Arbre de décision — champs métier conditionnels', () => {
  it('exige la direction du déclarant salarié quand il n’est pas la victime', () => {
    const r = analyser('ei_employe', false, {
      declarantEstVictime: false,
      directionDeclarant: undefined,
    })

    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain('directionDeclarant')
  })

  it('n’exige pas cette direction quand le déclarant est la victime', () => {
    expect(analyser('ei_employe', false, { declarantEstVictime: true }).success).toBe(true)
  })

  it('exige la précision de la qualité communautaire uniquement pour « autre »', () => {
    expect(analyser('grief_communaute', false, { statutPlaignant: 'autre' }).success).toBe(false)
    expect(
      analyser('grief_communaute', false, {
        statutPlaignant: 'autre',
        statutPlaignantPrecision: 'Pêcheur',
      }).success
    ).toBe(true)
    expect(analyser('grief_communaute', false, { statutPlaignant: 'riverain' }).success).toBe(true)
  })

  it.each([
    ['ei_employe', 'dateSurvenance'],
    ['grief_employe', 'dateHeureFaits'],
    ['grief_sous_traitant', 'dateHeureFaits'],
    ['grief_communaute', 'dateSurvenance'],
  ] as const)('refuse une date future pour %s', (parcours, champ) => {
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)

    const r = analyser(parcours, false, { [champ]: demain.toISOString() })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(champ)
  })

  it('refuse une valeur hors liste pour le caractère répétitif', () => {
    expect(analyser('grief_employe', false, { caractereRepetitif: 'inconnu' }).success).toBe(false)
  })
})
