import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { calculerPour, historiqueMensuel } from '../statistiques-mensuelles'

/**
 * EX-REP-05 — port de `App\Services\Reporting\StatistiqueMensuelleService`.
 *
 * La propriété qui compte n'est pas le calcul, c'est son IRRÉVERSIBILITÉ : une période archivée
 * n'est jamais réécrite. Un recalcul accidentel ne doit pas pouvoir corriger en silence une
 * valeur déjà publiée.
 */
const dossiersCrees: string[] = []

/** Mars 2020 : aucun dossier réel n'y figure, l'archivage de ce mois n'affecte donc rien. */
const MOIS = new Date(Date.UTC(2020, 2, 1))
const MOIS_SUIVANT = new Date(Date.UTC(2020, 3, 1))

async function dossierEnMars2020(statutCode: string, clotureApresJours?: number): Promise<void> {
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
  const statut = await prisma.statuts_dossier.findFirstOrThrow({
    where: { code: statutCode },
    select: { id: true },
  })

  let cloture: Date | null = null

  if (clotureApresJours !== undefined) {
    cloture = new Date(soumission)
    cloture.setUTCDate(cloture.getUTCDate() + clotureApresJours)
  }

  await prisma.dossiers.update({
    where: { id: dossierId },
    data: { created_at: soumission, statut_id: statut.id, date_cloture: cloture },
  })
}

async function lignesArchivees() {
  return prisma.statistiques_mensuelles.findMany({ where: { periode: MOIS } })
}

afterEach(async () => {
  // Les lignes de mars 2020 sont exclusivement produites par ce fichier.
  await prisma.statistiques_mensuelles.deleteMany({ where: { periode: MOIS } })
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Archivage mensuel (EX-REP-05)', () => {
  it('n’archive rien pour un mois sans dossier', async () => {
    expect(await calculerPour(MOIS)).toEqual({ creees: 0, ignorees: 0 })
    expect(await lignesArchivees()).toHaveLength(0)
  })

  it('agrège volumes, taux et délai par combinaison', async () => {
    await dossierEnMars2020('cloture', 6)
    await dossierEnMars2020('cloture', 10)
    await dossierEnMars2020('en_analyse')
    await dossierEnMars2020('rejete')

    const resultat = await calculerPour(MOIS)
    expect(resultat.creees).toBe(1)

    const [ligne] = await lignesArchivees()

    expect(ligne.nb_declarations).toBe(4)
    // « Résolu » ou « Clôturé » — le rejet n'y figure pas.
    expect(ligne.nb_resolues).toBe(2)
    // Statuts terminaux — le rejet y figure.
    expect(ligne.nb_cloturees).toBe(3)
    expect(Number(ligne.delai_moyen_jours)).toBe(8)
    expect(Number(ligne.taux_resolution)).toBe(50)
    expect(Number(ligne.taux_cloture)).toBe(75)
  })

  it('ne réécrit JAMAIS une période déjà archivée', async () => {
    await dossierEnMars2020('en_analyse')
    expect((await calculerPour(MOIS)).creees).toBe(1)

    const [avant] = await lignesArchivees()

    // Un dossier de plus, puis un recalcul : la valeur publiée ne doit pas bouger.
    await dossierEnMars2020('en_analyse')
    const second = await calculerPour(MOIS)

    expect(second).toEqual({ creees: 0, ignorees: 1 })

    const lignes = await lignesArchivees()
    expect(lignes).toHaveLength(1)
    expect(lignes[0].id).toBe(avant.id)
    expect(lignes[0].nb_declarations).toBe(1)
  })

  it('n’archive que le mois demandé', async () => {
    await dossierEnMars2020('en_analyse')

    await calculerPour(MOIS)

    const horsMois = await prisma.statistiques_mensuelles.count({
      where: { periode: { gte: MOIS_SUIVANT } },
    })
    expect(horsMois).toBe(0)
  })

  it('ne contient aucune donnée réidentifiante (RG-12)', async () => {
    await dossierEnMars2020('en_analyse')
    await calculerPour(MOIS)

    const [ligne] = await lignesArchivees()
    const champs = Object.keys(ligne)

    // Seulement des agrégats : ni référence, ni identifiant de dossier, ni identité.
    expect(champs).not.toContain('dossier_id')
    expect(champs).not.toContain('reference')
    // `JSON.stringify` ne sait pas sérialiser un BigInt : les identifiants sont convertis.
    const serialisee = JSON.stringify(ligne, (_cle, valeur) =>
      typeof valeur === 'bigint' ? String(valeur) : valeur
    )
    expect(serialisee).not.toMatch(/EI-\d{4}-\d{6}/)
  })
})

describe('Historique mensuel', () => {
  it('agrège les lignes d’une même période en une seule', async () => {
    await dossierEnMars2020('cloture', 6)
    // Une gravité différente crée une seconde combinaison sur le même mois.
    const categorie = await categoriePour('ei_employe')
    const graviteHaute = await graviteParNiveau(3)

    const { dossierId } = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: graviteHaute.id,
        description: 'Description factuelle de test suffisamment longue.',
      },
    })
    dossiersCrees.push(dossierId)
    await prisma.dossiers.update({
      where: { id: dossierId },
      data: { created_at: new Date(Date.UTC(2020, 2, 12, 8, 0, 0)) },
    })

    expect((await calculerPour(MOIS)).creees).toBe(2)

    const historique = await historiqueMensuel()
    const mars = historique.find((l) => l.periode === '2020-03-01')

    expect(mars).toBeDefined()
    expect(mars?.total).toBe(2)
  })
})
