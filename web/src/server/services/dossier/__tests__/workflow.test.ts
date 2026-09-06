import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { reaffecter } from '../affectation'
import { changerStatut, cloturer, rejeter, reouvrir, ErreurWorkflow } from '../workflow'
import type { StatutCode } from '../statuts'

/**
 * Port de `tests/Feature/Services/DossierWorkflowServiceTest.php` et
 * `AffectationServiceTest.php` (Laravel).
 */
const crees: string[] = []

async function nouveauDossier() {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const resultat = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })

  crees.push(resultat.dossierId)
  return resultat.dossierId
}

/** Force un statut sans passer par le workflow, pour placer le dossier au point à tester. */
async function placerAuStatut(dossierId: string, code: StatutCode) {
  const statut = await prisma.statuts_dossier.findFirstOrThrow({ where: { code } })
  await prisma.dossiers.update({ where: { id: dossierId }, data: { statut_id: statut.id } })
}

async function statutDe(dossierId: string): Promise<string> {
  const d = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })
  return d.statuts_dossier.code
}

async function acteur(): Promise<bigint> {
  const u = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return u.id
}

afterEach(async () => {
  await nettoyerDossiers(crees)
  crees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Machine à états (CDC §7.1)', () => {
  it('suit le graphe de transitions et refuse celles qui en sortent (EX-GES-04)', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'affecte')

    await changerStatut({ dossierId: id, vers: 'en_analyse', acteurId: await acteur() })
    expect(await statutDe(id)).toBe('en_analyse')

    // « En analyse » ne mène pas directement à « Résolu ».
    await expect(
      changerStatut({ dossierId: id, vers: 'resolu', acteurId: await acteur() })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    expect(await statutDe(id)).toBe('en_analyse')
  })

  it('enregistre une entrée d’historique pour chaque transition, avec son auteur (RG-04)', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'affecte')
    const acteurId = await acteur()

    await changerStatut({ dossierId: id, vers: 'en_analyse', acteurId, commentaire: 'Analyse ouverte.' })

    const derniere = await prisma.historique_statuts.findFirst({
      where: { dossier_id: id },
      // Tri par `id` et non par `created_at` : cette colonne est en timestamp(0), donc a la
      // seconde pres — plusieurs entrees creees dans la meme seconde seraient departagees
      // arbitrairement.
      orderBy: { id: 'desc' },
      select: {
        effectue_par: true,
        commentaire: true,
        statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: { select: { code: true } },
      },
    })

    expect(derniere?.effectue_par).toBe(acteurId)
    expect(derniere?.commentaire).toBe('Analyse ouverte.')
    expect(
      derniere?.statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier.code
    ).toBe('en_analyse')
  })
})

describe('Rejet', () => {
  it('n’est possible que depuis « En analyse » et conserve le motif', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'affecte')

    await expect(
      rejeter({ dossierId: id, acteurId: await acteur(), motif: 'Hors périmètre' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    await placerAuStatut(id, 'en_analyse')
    await rejeter({ dossierId: id, acteurId: await acteur(), motif: 'Hors périmètre du dispositif.' })

    const d = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(await statutDe(id)).toBe('rejete')
    expect(d.motif_rejet).toBe('Hors périmètre du dispositif.')
    // Un dossier rejeté n'est pas un dossier mené à terme : pas de date de clôture.
    expect(d.date_cloture).toBeNull()
  })
})

describe('Clôture (RG-10)', () => {
  it('refuse la clôture d’un dossier qui n’est pas « Résolu »', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'en_analyse')

    await expect(
      cloturer({ dossierId: id, acteurId: await acteur(), syntheseResolution: 'Synthèse complète.' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('clôture un dossier sans action corrective (RG-10 vacuement satisfaite) et date la clôture', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'resolu')

    await cloturer({
      dossierId: id,
      acteurId: await acteur(),
      syntheseResolution: 'Situation normalisée après intervention.',
    })

    const d = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(await statutDe(id)).toBe('cloture')
    expect(d.synthese_resolution).toBe('Situation normalisée après intervention.')
    // Conditionne le délai moyen (DT-31), les statistiques (EX-REP-05) et la conservation (RG-11).
    expect(d.date_cloture).not.toBeNull()
  })

  it('refuse la clôture tant qu’une action corrective est ouverte ou non vérifiée (RG-10)', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'resolu')
    const acteurId = await acteur()

    const action = await prisma.actions_correctives.create({
      data: {
        id: `test${Date.now().toString(36)}`.padEnd(26, '0').slice(0, 26),
        dossier_id: id,
        intitule: 'Action de test',
        description: 'Description',
        responsable_id: acteurId,
        echeance: new Date(),
        statut: 'non_demarree',
        date_cloture: null,
        verification_efficacite: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })

    await expect(
      cloturer({ dossierId: id, acteurId, syntheseResolution: 'Synthèse complète.' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    // Close mais efficacité non vérifiée : toujours bloquant.
    await prisma.actions_correctives.update({
      where: { id: action.id },
      data: { date_cloture: new Date(), verification_efficacite: false },
    })

    await expect(
      cloturer({ dossierId: id, acteurId, syntheseResolution: 'Synthèse complète.' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    // Close ET efficacité vérifiée : la clôture devient possible.
    await prisma.actions_correctives.update({
      where: { id: action.id },
      data: { verification_efficacite: true },
    })

    await cloturer({ dossierId: id, acteurId, syntheseResolution: 'Synthèse complète et vérifiée.' })
    expect(await statutDe(id)).toBe('cloture')

    await prisma.actions_correctives.delete({ where: { id: action.id } })
  })
})

describe('Réouverture (RG-07)', () => {
  it('n’est possible que depuis « Clôturé » et conserve le motif', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'resolu')

    await expect(
      reouvrir({ dossierId: id, acteurId: await acteur(), motif: 'Nouvel élément.' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    await placerAuStatut(id, 'cloture')
    await reouvrir({ dossierId: id, acteurId: await acteur(), motif: 'Nouvel élément porté à notre connaissance.' })

    const d = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(await statutDe(id)).toBe('reouvert')
    expect(d.motif_reouverture).toBe('Nouvel élément porté à notre connaissance.')
  })

  it('exige un motif', async () => {
    const id = await nouveauDossier()
    await placerAuStatut(id, 'cloture')

    await expect(
      reouvrir({ dossierId: id, acteurId: await acteur(), motif: '   ' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('Réaffectation (EX-GES-03, DT-06)', () => {
  it('désactive le titulaire précédent et trace le motif', async () => {
    const id = await nouveauDossier()
    const acteurId = await acteur()
    const autre = await prisma.users.findFirstOrThrow({
      where: { id: { not: acteurId }, actif: true },
      select: { id: true },
    })

    await reaffecter({
      dossierId: id,
      nouvelUtilisateurId: autre.id,
      effectueParId: acteurId,
      motif: 'Congé maladie du titulaire.',
    })

    const actives = await prisma.dossier_affectations.findMany({
      where: { dossier_id: id, actif: true },
    })

    expect(actives).toHaveLength(1)
    expect(actives[0].user_id).toBe(autre.id)
    expect(actives[0].motif).toBe('Congé maladie du titulaire.')
    expect(actives[0].type).toBe('reaffectation')
  })

  it('exige un motif', async () => {
    const id = await nouveauDossier()

    await expect(
      reaffecter({
        dossierId: id,
        nouvelUtilisateurId: await acteur(),
        effectueParId: await acteur(),
        motif: '   ',
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse d’affecter le déclarant identifié à son propre dossier (DT-06)', async () => {
    const declarant = await acteur()
    const categorie = await categoriePour('ei_employe')
    const gravite = await graviteParNiveau(1)

    const { dossierId } = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: false,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: gravite.id,
        description: 'Description factuelle de test suffisamment longue.',
        declarantUserId: declarant,
      },
      donneesIdentite: { nomPrenom: 'Awa Koffi' },
    })
    crees.push(dossierId)

    await expect(
      reaffecter({
        dossierId,
        nouvelUtilisateurId: declarant,
        effectueParId: declarant,
        motif: 'Prise en charge.',
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})
