import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  mettreAJourInvestigation,
  ouvrirInvestigation,
  soumettrePourValidation,
  validerInvestigation,
} from '../investigation'

/** Port de `tests/Feature/Services/InvestigationServiceTest.php` (Laravel). */
const dossiersCrees: string[] = []
const investigationsCreees: string[] = []

const DONNEES = {
  faitsConstates: 'Constats relevés lors de la visite sur site.',
  recommandations: 'Renforcer la signalisation et former les équipes.',
}

/**
 * Amène un dossier jusqu'à « En investigation » par de VRAIES transitions, afin que
 * `historique_statuts` contienne l'entrée exploitée par RGI-05 — un statut forcé en base
 * laisserait le calcul de recevabilité sans point de départ.
 */
async function dossierEnInvestigation(acteurId: bigint): Promise<string> {
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

  const { changerStatut } = await import('../../dossier/workflow')
  const statutActuel = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  // L'affectation automatique a pu déjà placer le dossier en « Affecté ».
  if (statutActuel.statuts_dossier.code === 'recu') {
    await changerStatut({ dossierId, vers: 'affecte', acteurId })
  }
  await changerStatut({ dossierId, vers: 'en_analyse', acteurId })
  await changerStatut({ dossierId, vers: 'en_investigation', acteurId })

  return dossierId
}

async function deuxUtilisateurs(): Promise<[bigint, bigint]> {
  const users = await prisma.users.findMany({ where: { actif: true }, take: 2, select: { id: true } })
  return [users[0].id, users[1].id]
}

afterEach(async () => {
  if (investigationsCreees.length > 0) {
    await prisma.investigations.deleteMany({ where: { id: { in: investigationsCreees } } })
    investigationsCreees.length = 0
  }
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Ouverture d’une investigation (EX-INV-01, RGI-05)', () => {
  it('ouvre une fiche sur un dossier « En investigation »', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)

    const investigation = await prisma.investigations.findUniqueOrThrow({ where: { id } })
    expect(investigation.statut).toBe('en_cours')
    expect(investigation.enqueteur_id).toBe(enqueteur)
  })

  it('refuse l’ouverture sur un dossier qui n’est pas « En investigation » (EX-INV-01)', async () => {
    const [enqueteur] = await deuxUtilisateurs()
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

    await expect(
      ouvrirInvestigation({
        dossierId,
        enqueteurId: enqueteur,
        dateOuverture: new Date(),
        donnees: DONNEES,
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse une date d’ouverture antérieure à la recevabilité du dossier (RGI-05)', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const hier = new Date()
    hier.setDate(hier.getDate() - 1)

    await expect(
      ouvrirInvestigation({ dossierId, enqueteurId: enqueteur, dateOuverture: hier, donnees: DONNEES })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('Mise à jour et soumission', () => {
  it('refuse la modification d’une investigation qui n’est plus « en cours »', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)

    await soumettrePourValidation(id)

    await expect(
      mettreAJourInvestigation({ investigationId: id, donnees: DONNEES })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse la soumission sans recommandations (EX-INV-04)', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: { ...DONNEES, recommandations: 'à compléter' },
    })
    investigationsCreees.push(id)

    // Les recommandations sont la source des actions correctives : les vider rend la
    // soumission impossible.
    await prisma.investigations.update({ where: { id }, data: { recommandations: '   ' } })

    await expect(soumettrePourValidation(id)).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('Validation hiérarchique (RGI-06, EX-INV-05)', () => {
  it('n’autorise JAMAIS l’enquêteur à valider sa propre investigation', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)
    await soumettrePourValidation(id)

    await expect(
      validerInvestigation({ investigationId: id, validateurId: enqueteur })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    expect((await prisma.investigations.findUniqueOrThrow({ where: { id } })).statut).toBe(
      'en_attente_validation'
    )
  })

  it('autorise un acteur distinct à valider, et trace validateur et date', async () => {
    const [enqueteur, validateur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)
    await soumettrePourValidation(id)

    await validerInvestigation({ investigationId: id, validateurId: validateur })

    const investigation = await prisma.investigations.findUniqueOrThrow({ where: { id } })
    expect(investigation.statut).toBe('validee')
    expect(investigation.valide_par).toBe(validateur)
    expect(investigation.valide_le).not.toBeNull()
  })

  it('refuse de valider une investigation qui n’est pas en attente de validation', async () => {
    const [enqueteur, validateur] = await deuxUtilisateurs()
    const dossierId = await dossierEnInvestigation(enqueteur)

    const id = await ouvrirInvestigation({
      dossierId,
      enqueteurId: enqueteur,
      dateOuverture: new Date(),
      donnees: DONNEES,
    })
    investigationsCreees.push(id)

    // Toujours « en cours » : la validation ne doit pas court-circuiter la soumission.
    await expect(
      validerInvestigation({ investigationId: id, validateurId: validateur })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})
