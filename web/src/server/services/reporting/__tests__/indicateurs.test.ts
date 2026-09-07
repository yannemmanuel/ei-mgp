import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { clauseFiltre, filtreDepuisParametres } from '../filtre'
import {
  calculerIndicateurs,
  delaiMoyenJours,
  nbDeclarations,
  tauxCloture,
  tauxResolution,
} from '../indicateurs'

/**
 * EX-REP-03 — port de `App\Services\Reporting\IndicateurService`.
 *
 * Les dossiers de test sont isolés par un filtre de PÉRIODE lointaine : la base de développement
 * contient de vrais dossiers, et des assertions sur des compteurs globaux dépendraient d'eux.
 */
const dossiersCrees: string[] = []

/** Mois sans aucun dossier réel (les dossiers de la base sont d'août 2026). */
const MOIS_TEST = new Date(Date.UTC(2020, 2, 1))
const PERIODE = {
  periodeDebut: new Date(Date.UTC(2020, 2, 1)),
  periodeFin: new Date(Date.UTC(2020, 2, 31)),
}

async function dossierEn2020(options: {
  statutCode?: string
  clotureApresJours?: number
} = {}): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })
  dossiersCrees.push(dossierId)

  const soumission = new Date(Date.UTC(2020, 2, 10, 8, 0, 0))

  const donnees: Record<string, unknown> = { created_at: soumission }

  if (options.statutCode) {
    const statut = await prisma.statuts_dossier.findFirstOrThrow({
      where: { code: options.statutCode },
      select: { id: true },
    })
    donnees.statut_id = statut.id
  }

  if (options.clotureApresJours !== undefined) {
    const cloture = new Date(soumission)
    cloture.setUTCDate(cloture.getUTCDate() + options.clotureApresJours)
    donnees.date_cloture = cloture
  }

  await prisma.dossiers.update({ where: { id: dossierId }, data: donnees })

  return dossierId
}

afterEach(async () => {
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Comptage et taux', () => {
  it('ne compte que les dossiers du périmètre filtré', async () => {
    expect(await nbDeclarations(PERIODE)).toBe(0)

    await dossierEn2020()
    await dossierEn2020()

    expect(await nbDeclarations(PERIODE)).toBe(2)
  })

  it('renvoie null plutôt que zéro sur un périmètre vide', async () => {
    // Un taux calculé sur aucun dossier n'est pas « 0 % » : il n'existe pas.
    expect(await tauxResolution(PERIODE)).toBeNull()
    expect(await tauxCloture(PERIODE)).toBeNull()
    expect(await delaiMoyenJours(PERIODE)).toBeNull()
  })

  it('compte « Résolu » et « Clôturé » dans le taux de résolution (DT-31)', async () => {
    await dossierEn2020({ statutCode: 'resolu' })
    await dossierEn2020({ statutCode: 'cloture' })
    await dossierEn2020({ statutCode: 'en_analyse' })

    expect(await tauxResolution(PERIODE)).toBe(66.67)
  })

  it('compte un dossier rejeté dans la clôture mais jamais dans la résolution', async () => {
    await dossierEn2020({ statutCode: 'rejete' })
    await dossierEn2020({ statutCode: 'en_analyse' })

    // « Rejeté » est terminal : administrativement clos, jamais résolu.
    expect(await tauxCloture(PERIODE)).toBe(50)
    expect(await tauxResolution(PERIODE)).toBe(0)
  })
})

describe('Délai moyen', () => {
  it('moyenne les seuls dossiers effectivement clôturés', async () => {
    await dossierEn2020({ statutCode: 'cloture', clotureApresJours: 4 })
    await dossierEn2020({ statutCode: 'cloture', clotureApresJours: 10 })
    // Sans date de clôture : hors moyenne, sans condition supplémentaire à écrire.
    await dossierEn2020({ statutCode: 'en_analyse' })

    expect(await delaiMoyenJours(PERIODE)).toBe(7)
  })

  it('applique bien le filtre à la requête brute', async () => {
    await dossierEn2020({ statutCode: 'cloture', clotureApresJours: 4 })

    const gravite = await graviteParNiveau(4)

    // Filtre sur une autre gravité : le dossier créé est de niveau 1, la moyenne doit être vide.
    expect(await delaiMoyenJours({ ...PERIODE, niveauGraviteId: gravite.id })).toBeNull()
  })
})

describe('Répartitions', () => {
  it('ventile par parcours, statut et gravité', async () => {
    await dossierEn2020({ statutCode: 'en_analyse' })
    await dossierEn2020({ statutCode: 'en_analyse' })

    const indicateurs = await calculerIndicateurs(PERIODE)

    expect(indicateurs.total).toBe(2)
    expect(indicateurs.parParcours).toHaveLength(1)
    expect(indicateurs.parParcours[0].total).toBe(2)
    expect(indicateurs.parStatut.map((l) => l.total)).toEqual([2])
    expect(indicateurs.parGravite[0].couleur).toBeTruthy()
  })
})

describe('Lecture du filtre', () => {
  it('inclut toute la journée de la borne de fin', () => {
    const clause = clauseFiltre({ periodeFin: new Date(2026, 0, 15) })
    const fin = (clause.created_at as { lte: Date }).lte

    // Un `lte` à minuit exclurait tout ce qui a été soumis dans la journée du 15.
    expect(fin.getHours()).toBe(23)
    expect(fin.getMinutes()).toBe(59)
  })

  it('ignore les paramètres d’URL invalides au lieu d’échouer', () => {
    const filtre = filtreDepuisParametres({
      parcoursId: 'abc',
      statutId: '-1',
      periodeDebut: 'pas-une-date',
      niveauGraviteId: '3',
    })

    expect(filtre.parcoursId).toBeNull()
    expect(filtre.statutId).toBeNull()
    expect(filtre.periodeDebut).toBeNull()
    expect(filtre.niveauGraviteId).toBe(3n)
  })

  it('produit une clause vide quand aucun filtre n’est fourni', () => {
    expect(clauseFiltre(filtreDepuisParametres({}))).toEqual({})
  })
})

describe('Isolation du mois de test', () => {
  it('n’inclut aucun dossier réel de la base', async () => {
    // Garde-fou : si un dossier réel apparaissait en mars 2020, tous les cas ci-dessus
    // deviendraient faux sans le signaler.
    const reels = await prisma.dossiers.count({
      where: { created_at: { gte: MOIS_TEST, lt: new Date(Date.UTC(2020, 3, 1)) } },
    })

    expect(reels).toBe(0)
  })
})
