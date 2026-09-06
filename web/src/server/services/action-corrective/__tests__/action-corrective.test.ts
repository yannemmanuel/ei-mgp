import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { changerStatut, ErreurWorkflow } from '../../dossier/workflow'
import { soumettrePourValidation, validerInvestigation } from '../../investigation/investigation'
import {
  changerStatutAction,
  cloturerAction,
  creerAction,
  recalculerRetards,
  verifierEfficacite,
} from '../action-corrective'

/** Port de `tests/Feature/Services/ActionCorrectiveServiceTest.php` (Laravel). */
const dossiersCrees: string[] = []
const actionsCreees: string[] = []
const investigationsCreees: string[] = []

function demain(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d
}

async function deuxUtilisateurs(): Promise<[bigint, bigint]> {
  const users = await prisma.users.findMany({ where: { actif: true }, take: 2, select: { id: true } })
  return [users[0].id, users[1].id]
}

/** Amène un dossier jusqu'à « Action corrective en cours » par de vraies transitions. */
async function dossierEnActionCorrective(acteurId: bigint): Promise<string> {
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

  const actuel = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  if (actuel.statuts_dossier.code === 'recu') {
    await changerStatut({ dossierId, vers: 'affecte', acteurId })
  }
  await changerStatut({ dossierId, vers: 'en_analyse', acteurId })
  await changerStatut({ dossierId, vers: 'en_investigation', acteurId })
  await changerStatut({ dossierId, vers: 'action_corrective_en_cours', acteurId })

  return dossierId
}

async function nouvelleAction(dossierId: string, responsableId: bigint): Promise<string> {
  const id = await creerAction({
    dossierId,
    intitule: 'Action de test',
    description: 'Description de l’action corrective.',
    responsableId,
    echeance: demain(),
  })
  actionsCreees.push(id)
  return id
}

afterEach(async () => {
  if (actionsCreees.length > 0) {
    await prisma.actions_correctives.deleteMany({ where: { id: { in: actionsCreees } } })
    actionsCreees.length = 0
  }
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

describe('Création (EX-ACT-01/02, RGI-07)', () => {
  it('crée une action sur un dossier « Action corrective en cours »', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    const id = await nouvelleAction(dossierId, acteur)

    const action = await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })
    expect(action.statut).toBe('non_demarree')
    expect(action.responsable_id).toBe(acteur)
  })

  it('refuse la création sur un dossier à un autre statut', async () => {
    const [acteur] = await deuxUtilisateurs()
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
      creerAction({
        dossierId,
        intitule: 'A',
        description: 'B',
        responsableId: acteur,
        echeance: demain(),
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse une échéance non postérieure à la date de création (RGI-07)', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    await expect(
      creerAction({
        dossierId,
        intitule: 'Action',
        description: 'Description',
        responsableId: acteur,
        echeance: new Date(), // aujourd'hui : refusé
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse le rattachement à une investigation non validée (EX-ACT-01)', async () => {
    const [enqueteur, validateur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(enqueteur)

    // L'investigation doit être ouverte alors que le dossier est « En investigation » :
    // on la crée directement pour ce test, le workflow ayant déjà avancé.
    const investigation = await prisma.investigations.create({
      data: {
        id: `inv${Date.now().toString(36)}`.padEnd(26, '0').slice(0, 26),
        dossier_id: dossierId,
        enqueteur_id: enqueteur,
        date_ouverture: new Date(),
        faits_constates: 'Constats.',
        recommandations: 'Recommandations.',
        statut: 'en_cours',
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    investigationsCreees.push(investigation.id)

    await expect(
      creerAction({
        dossierId,
        investigationId: investigation.id,
        intitule: 'Action',
        description: 'Description',
        responsableId: enqueteur,
        echeance: demain(),
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    // Une fois validée, le rattachement devient possible.
    await soumettrePourValidation(investigation.id)
    await validerInvestigation({ investigationId: investigation.id, validateurId: validateur })

    const id = await creerAction({
      dossierId,
      investigationId: investigation.id,
      intitule: 'Action',
      description: 'Description',
      responsableId: enqueteur,
      echeance: demain(),
    })
    actionsCreees.push(id)

    expect((await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })).investigation_id).toBe(
      investigation.id
    )
  })
})

describe('Avancement (EX-ACT-03)', () => {
  it('suit le graphe non démarrée → en cours → réalisée', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId, acteur)

    await changerStatutAction({ actionId: id, vers: 'en_cours' })
    await changerStatutAction({ actionId: id, vers: 'realisee' })

    expect((await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })).statut).toBe('realisee')
  })

  it('refuse de sauter directement de « non démarrée » à « réalisée »', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId, acteur)

    await expect(changerStatutAction({ actionId: id, vers: 'realisee' })).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })

  it('bascule en retard les actions échues, mais jamais une action réalisée', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    const enCours = await nouvelleAction(dossierId, acteur)
    const realisee = await nouvelleAction(dossierId, acteur)

    const hier = new Date()
    hier.setDate(hier.getDate() - 1)

    await prisma.actions_correctives.update({ where: { id: enCours }, data: { echeance: hier } })
    await changerStatutAction({ actionId: realisee, vers: 'en_cours' })
    await changerStatutAction({ actionId: realisee, vers: 'realisee' })
    await prisma.actions_correctives.update({ where: { id: realisee }, data: { echeance: hier } })

    await recalculerRetards()

    expect((await prisma.actions_correctives.findUniqueOrThrow({ where: { id: enCours } })).statut).toBe(
      'en_retard'
    )
    // Échéance passée, mais le travail est fait : la marquer en retard serait faux.
    expect((await prisma.actions_correctives.findUniqueOrThrow({ where: { id: realisee } })).statut).toBe(
      'realisee'
    )
  })
})

describe('Vérification d’efficacité (EX-ACT-04, RGI-08)', () => {
  it('refuse la vérification avant que l’action soit réalisée', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId, acteur)

    await expect(
      verifierEfficacite({ actionId: id, efficace: true, commentaire: 'Vérifié.' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('exige un commentaire pour une vérification positive (RGI-08)', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId, acteur)

    await changerStatutAction({ actionId: id, vers: 'en_cours' })
    await changerStatutAction({ actionId: id, vers: 'realisee' })

    await expect(
      verifierEfficacite({ actionId: id, efficace: true, commentaire: '   ' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    // Une vérification NÉGATIVE n'exige pas de commentaire.
    await verifierEfficacite({ actionId: id, efficace: false, commentaire: null })
    expect(
      (await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })).verification_efficacite
    ).toBe(false)
  })
})

describe('Clôture (RGI-09, EX-ACT-05)', () => {
  it('refuse la clôture sans vérification d’efficacité positive (RGI-09)', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId, acteur)

    await expect(cloturerAction({ actionId: id, acteurId: acteur })).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })

  it('fait avancer le dossier à « Résolu » quand la dernière action est close (EX-ACT-05)', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    const a = await nouvelleAction(dossierId, acteur)
    const b = await nouvelleAction(dossierId, acteur)

    for (const id of [a, b]) {
      await changerStatutAction({ actionId: id, vers: 'en_cours' })
      await changerStatutAction({ actionId: id, vers: 'realisee' })
      await verifierEfficacite({ actionId: id, efficace: true, commentaire: 'Efficace.' })
    }

    // Première clôture : une action reste ouverte, le dossier ne bouge pas.
    await cloturerAction({ actionId: a, acteurId: acteur })
    let dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { statuts_dossier: { select: { code: true } } },
    })
    expect(dossier.statuts_dossier.code).toBe('action_corrective_en_cours')

    // Seconde clôture : plus rien d'ouvert, le dossier avance automatiquement.
    await cloturerAction({ actionId: b, acteurId: acteur })
    dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { statuts_dossier: { select: { code: true } } },
    })
    expect(dossier.statuts_dossier.code).toBe('resolu')
  })
})
