import { describe, expect, it } from 'vitest'

/**
 * EX-DEC-02 : chaque parcours est atteignable par son propre lien `/declarer/{code}`, sans
 * dépendance à un QR code. EX-DEC-03 : la bascule d'anonymat conditionne les champs rendus.
 */
import { schemaParcours } from '@/lib/validations/formulaire-parcours'
import { CODES_PARCOURS, PARCOURS, champsVisibles } from '../parcours-config'

/**
 * RGI-03 : si l'anonymat est coché, aucun champ d'identification n'est collecté — sur AUCUN des
 * 4 parcours. C'est la garantie d'affichage qui complète la garantie structurelle vérifiée côté
 * service (aucune ligne `declaration_identites` créée).
 */
describe('Masquage des champs d’identité en anonyme (RGI-03)', () => {
  it.each(CODES_PARCOURS)('ne rend aucun champ d’identité pour %s en anonyme', (code) => {
    const visibles = champsVisibles(PARCOURS[code], true)

    // `statutPlaignant` qualifie la plainte, pas la personne : seule exception documentée.
    const identiteRestante = visibles.filter((c) => c.identite && c.nom !== 'statutPlaignant')

    expect(identiteRestante).toEqual([])
  })

  it.each(CODES_PARCOURS)('rend les champs d’identité pour %s en identifié', (code) => {
    const visibles = champsVisibles(PARCOURS[code], false)

    expect(visibles.some((c) => c.identite)).toBe(true)
  })

  it('conserve les champs de contexte et de nature même en anonyme', () => {
    for (const code of CODES_PARCOURS) {
      const visibles = champsVisibles(PARCOURS[code], true)
      // Le contexte (étape 2) décrit les faits, jamais la personne : il reste toujours demandé.
      expect(visibles.some((c) => c.etape === 2)).toBe(true)
    }
  })
})

describe('Schéma dérivé de la configuration', () => {
  const socle = {
    anonymat: true,
    categorieId: '1',
    niveauGraviteId: '1',
    description: 'Description factuelle suffisamment longue pour être acceptée.',
    horodatageAffichage: Math.floor(Date.now() / 1000) - 60,
  }

  it('exige les champs de contexte obligatoires même en anonyme', () => {
    const resultat = schemaParcours(PARCOURS.ei_employe, true).safeParse(socle)

    expect(resultat.success).toBe(false)
    const champs = resultat.error?.issues.map((i) => String(i.path[0]))
    expect(champs).toContain('dateSurvenance')
    expect(champs).toContain('lieu')
  })

  it('accepte une déclaration anonyme complète', () => {
    const resultat = schemaParcours(PARCOURS.ei_employe, true).safeParse({
      ...socle,
      dateSurvenance: new Date().toISOString().slice(0, 10),
      lieu: 'Atelier de concassage',
      directionId: '1',
    })

    expect(resultat.success).toBe(true)
  })

  it('exige la direction, anonyme ou non (EI Employé)', () => {
    /**
     * La direction était facultative en anonyme, et nulle en base. Depuis qu'elle porte le
     * rattachement au site — donc l'acheminement vers le secrétaire compétent —, l'omettre
     * produirait un dossier que personne d'habilité ne voit. Elle est demandée dans les deux cas.
     *
     * Ce n'est pas une donnée d'identité : une direction compte des centaines de personnes, comme
     * le lieu, déjà obligatoire et collecté anonymement.
     */
    const base = {
      ...socle,
      dateSurvenance: new Date().toISOString().slice(0, 10),
      lieu: 'Atelier',
    }

    for (const anonyme of [true, false]) {
      const sans = schemaParcours(PARCOURS.ei_employe, anonyme).safeParse({
        ...base,
        anonymat: anonyme,
      })

      expect(sans.success, `anonyme=${anonyme}`).toBe(false)
      expect(sans.error?.issues.map((i) => String(i.path[0]))).toContain('directionId')
    }

    expect(
      schemaParcours(PARCOURS.ei_employe, true).safeParse({
        ...base,
        anonymat: true,
        directionId: '1',
      }).success
    ).toBe(true)
  })

  it('rend le consentement RGPD bloquant pour le seul parcours Sous-traitant (RG-15)', () => {
    const base = {
      ...socle,
      anonymat: false,
      dateHeureFaits: new Date().toISOString().slice(0, 16),
      lieuSite: 'Chantier nord',
      nomPrenom: 'Awa Koffi',
      entreprise: 'Entreprise X',
    }

    const sansConsentement = schemaParcours(PARCOURS.grief_sous_traitant, false).safeParse(base)
    expect(sansConsentement.success).toBe(false)
    expect(sansConsentement.error?.issues.map((i) => String(i.path[0]))).toContain('consentementRgpd')

    const avecConsentement = schemaParcours(PARCOURS.grief_sous_traitant, false).safeParse({
      ...base,
      consentementRgpd: true,
    })
    expect(avecConsentement.success).toBe(true)

    // Aucun autre parcours ne porte ce champ : RG-15 ne vise que le sous-traitant.
    for (const code of CODES_PARCOURS) {
      const porte = PARCOURS[code].champs.some((c) => c.nom === 'consentementRgpd')
      expect(porte, code).toBe(code === 'grief_sous_traitant')
    }
  })

  it('refuse une date des faits postérieure à aujourd’hui, sur tous les parcours (RGI-01)', () => {
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)

    for (const code of CODES_PARCOURS) {
      const champDate = PARCOURS[code].champs.find((c) => c.type === 'date' || c.type === 'datetime')
      if (!champDate) continue

      const resultat = schemaParcours(PARCOURS[code], true).safeParse({
        ...socle,
        [champDate.nom]: demain.toISOString(),
      })

      expect(resultat.success, code).toBe(false)
      expect(resultat.error?.issues.map((i) => String(i.path[0])), code).toContain(champDate.nom)
    }
  })
})
