import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { changerStatut, ErreurWorkflow } from '../../dossier/workflow'
import {
  changerStatutAction,
  cloturerAction,
  creerAction,
  recalculerRetards,
  verifierEfficacite,
} from '../action-corrective'

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

  // ⚠️ « Affecté » a quitté le circuit le 2026-09-21 : « Reçu → En analyse » est la première
  // marche. Le dossier ne peut plus être ailleurs qu'à « Reçu » à sa création — plus aucune
  // déclaration n'est affectée —, mais la garde reste : elle dit d'où l'on part.
  if (actuel.statuts_dossier.code === 'recu') {
    await changerStatut({ dossierId, vers: 'en_analyse', acteurId })
  }
  await changerStatut({ dossierId, vers: 'en_investigation', acteurId })
  await changerStatut({ dossierId, vers: 'action_corrective_en_cours', acteurId })

  return dossierId
}

async function nouvelleAction(dossierId: string, responsableNom = 'Chef d’équipe maintenance'): Promise<string> {
  const id = await creerAction({
    dossierId,
    intitule: 'Action de test',
    description: 'Description de l’action corrective.',
    responsableNom,
    echeance: demain(),
  })
  actionsCreees.push(id)
  return id
}

/** Une fiche d'investigation sur un dossier déjà avancé — créée directement, le workflow ayant progressé. */
async function investigationSur(dossierId: string, enqueteurId: bigint): Promise<string> {
  const investigation = await prisma.investigations.create({
    data: {
      id: `inv${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.padEnd(26, '0').slice(0, 26),
      dossier_id: dossierId,
      enqueteur_id: enqueteurId,
      date_ouverture: new Date(),
      faits_constates: 'Constats.',
      recommandations: 'Recommandations.',
      statut: 'en_cours',
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })
  investigationsCreees.push(investigation.id)
  return investigation.id
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

describe('Création (EX-ACT-01, EX-ACT-02, RGI-07)', () => {
  it('crée une action sur un dossier « Action corrective en cours »', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    const id = await nouvelleAction(dossierId)

    const action = await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })
    expect(action.statut).toBe('non_demarree')
    expect(action.responsable_nom).toBe('Chef d’équipe maintenance')
  })

  it('refuse la création sur un dossier à un autre statut', async () => {
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
        responsableNom: 'Responsable de test',
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
        responsableNom: 'Responsable de test',
        echeance: new Date(), // aujourd'hui : refusé
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('rattache une action à N’IMPORTE QUELLE investigation du dossier (EX-ACT-01)', async () => {
    /*
      ⚠️ Le filtre « investigation validée » a été RETIRÉ : une investigation n'est plus soumise à
      validation. S'il subsistait, aucune fiche ne serait plus jamais éligible et le rattachement
      deviendrait impossible — une fonction qui disparaît sans que rien ne le signale.
    */
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(enqueteur)
    const investigation = await investigationSur(dossierId, enqueteur)

    const id = await creerAction({
      dossierId,
      investigationId: investigation,
      intitule: 'Action',
      description: 'Description',
      responsableNom: 'Prestataire extérieur',
      echeance: demain(),
    })
    actionsCreees.push(id)

    expect(
      (await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })).investigation_id
    ).toBe(investigation)
  })

  it('⚠️ refuse une investigation qui appartient à un AUTRE dossier', async () => {
    /*
      ⚠️ CE CONTRÔLE EST LE SEUL QUI RESTE sur le rattachement, et c'est un contrôle de SÉCURITÉ.
      Sans lui, un identifiant forgé rattacherait l'action à l'investigation d'un autre dossier —
      la faisant apparaître dans une fiche que son auteur n'a pas le droit de lire.
    */
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(enqueteur)
    const autreDossier = await dossierEnActionCorrective(enqueteur)
    const investigationAilleurs = await investigationSur(autreDossier, enqueteur)

    await expect(
      creerAction({
        dossierId,
        investigationId: investigationAilleurs,
        intitule: 'Action',
        description: 'Description',
        responsableNom: 'Chef de service',
        echeance: demain(),
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('⚠️ exige un responsable, même saisi à la main', async () => {
    // La saisie libre ne doit pas devenir une absence de responsable : une action dont personne
    // ne répond ne serait suivie par personne.
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(enqueteur)

    for (const vide of ['', '   ']) {
      await expect(
        creerAction({
          dossierId,
          intitule: 'Action',
          description: 'Description',
          responsableNom: vide,
          echeance: demain(),
        })
      ).rejects.toBeInstanceOf(ErreurWorkflow)
    }
  })

  it('enregistre le responsable saisi, sans le rattacher à un compte', async () => {
    const [enqueteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(enqueteur)

    const id = await nouvelleAction(dossierId, '  Équipe HSE du site  ')

    const action = await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })
    expect(action.responsable_nom, 'le nom n’est pas normalisé').toBe('Équipe HSE du site')
    expect(action.responsable_id, 'le responsable reste rattaché à un compte').toBeNull()
  })
})

describe('Avancement (EX-ACT-03)', () => {
  it('suit le graphe non démarrée → en cours → réalisée', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId)

    await changerStatutAction({ actionId: id, vers: 'en_cours' })
    await changerStatutAction({ actionId: id, vers: 'realisee' })

    expect((await prisma.actions_correctives.findUniqueOrThrow({ where: { id } })).statut).toBe('realisee')
  })

  it('refuse de sauter directement de « non démarrée » à « réalisée »', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId)

    await expect(changerStatutAction({ actionId: id, vers: 'realisee' })).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })

  it('bascule en retard les actions échues, mais jamais une action réalisée', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    const enCours = await nouvelleAction(dossierId)
    const realisee = await nouvelleAction(dossierId)

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
    const id = await nouvelleAction(dossierId)

    await expect(
      verifierEfficacite({ actionId: id, efficace: true, commentaire: 'Vérifié.' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('exige un commentaire pour une vérification positive (RGI-08)', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)
    const id = await nouvelleAction(dossierId)

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
    const id = await nouvelleAction(dossierId)

    await expect(cloturerAction({ actionId: id, acteurId: acteur })).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })

  it('fait avancer le dossier à « Résolu » quand la dernière action est close (EX-ACT-05)', async () => {
    const [acteur] = await deuxUtilisateurs()
    const dossierId = await dossierEnActionCorrective(acteur)

    const a = await nouvelleAction(dossierId)
    const b = await nouvelleAction(dossierId)

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
