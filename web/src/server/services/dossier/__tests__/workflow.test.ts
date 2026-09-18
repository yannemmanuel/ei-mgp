import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
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

describe('Clôture (RG-10, EX-GES-05)', () => {
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

describe('Réouverture (RG-07, EX-GES-06)', () => {
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

describe('⚠️ DT-06 — le déclarant n’instruit jamais son propre dossier', () => {
  /*
    La réaffectation manuelle a été SUPPRIMÉE : les affectations découlent désormais du parcours et
    du rattachement, à la création. Le bloc qui exerçait `reaffecter()` a disparu avec elle.

    ⚠️ Mais DT-06 ne vivait QUE là. Sans ce cas, la règle serait partie avec la fonction — et un
    correspondant qui déclare un grief se verrait confier l'instruction de son propre
    signalement. Elle est reportée dans l'affectation automatique, et tenue ici.
  */
  const comptesCrees: bigint[] = []
  const MODEL_TYPE_USER = String.raw`App\Models\User`

  afterAll(async () => {
    if (comptesCrees.length === 0) return

    await prisma.utilisateur_parcours.deleteMany({ where: { user_id: { in: comptesCrees } } })
    await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptesCrees } } })
    await prisma.dossier_affectations.deleteMany({ where: { user_id: { in: comptesCrees } } })
    await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
  })

  /** Un compte qui SERAIT affecté aux griefs employés : bon rôle, bon parcours, aucun site. */
  async function candidatNaturel(): Promise<bigint> {
    const role = await prisma.roles.findFirstOrThrow({
      where: { name: 'rgp', guard_name: 'web' },
      select: { id: true },
    })
    const parcours = await prisma.parcours.findFirstOrThrow({
      where: { code: 'grief_employe' },
      select: { id: true },
    })

    const compte = await prisma.users.create({
      data: {
        name: 'Correspondant déclarant',
        email: `dt06-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
        password: null,
        actif: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })
    comptesCrees.push(compte.id)

    await prisma.model_has_roles.create({
      data: { role_id: role.id, model_type: MODEL_TYPE_USER, model_id: compte.id },
    })
    await prisma.utilisateur_parcours.create({
      data: { user_id: compte.id, parcours_id: parcours.id },
    })

    return compte.id
  }

  async function griefDeclarePar(declarant: bigint | null): Promise<string> {
    const categorie = await categoriePour('grief_employe')
    const gravite = await graviteParNiveau(1)

    const { dossierId } = await creerDeclaration({
      parcours: 'grief_employe',
      canalCaptageCode: 'qr_code',
      anonyme: declarant === null,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: gravite.id,
        description: 'Description factuelle de test suffisamment longue.',
        ...(declarant === null ? {} : { declarantUserId: declarant }),
      },
      ...(declarant === null ? {} : { donneesIdentite: { nomPrenom: 'Awa Koffi' } }),
    })

    crees.push(dossierId)
    return dossierId
  }

  it('écarte le déclarant, qui aurait AUTREMENT été affecté', async () => {
    /*
      ⚠️ Le compte est fabriqué pour Être un candidat naturel — bon rôle, bon parcours. Sans cela
      le cas ne prouverait rien : un déclarant que l'affectation n'aurait de toute façon pas
      retenu reste absent des titulaires, garde ou pas.

      Le second dépôt, anonyme, le démontre : le MÊME compte y est bien affecté.
    */
    const declarant = await candidatNaturel()

    const temoin = await griefDeclarePar(null)
    const confiesSurLeTemoin = await prisma.dossier_affectations.count({
      where: { dossier_id: temoin, user_id: declarant, actif: true },
    })

    expect(
      confiesSurLeTemoin,
      'ce compte n’est pas un candidat naturel : le cas ne prouverait rien'
    ).toBe(1)

    const sien = await griefDeclarePar(declarant)
    const confiesSurLeSien = await prisma.dossier_affectations.count({
      where: { dossier_id: sien, user_id: declarant, actif: true },
    })

    expect(confiesSurLeSien, 'le déclarant s’est vu confier son propre dossier').toBe(0)
  })

  it('n’écarte personne d’une déclaration ANONYME', async () => {
    // Une déclaration anonyme n'est rattachée à aucun compte (RG-06) : il n'y a personne à
    // écarter, et la règle ne doit pas se mettre à retirer des titulaires au hasard.
    const declarant = await candidatNaturel()
    const anonyme = await griefDeclarePar(null)

    expect(
      await prisma.dossier_affectations.count({
        where: { dossier_id: anonyme, user_id: declarant, actif: true },
      })
    ).toBe(1)
  })
})

describe('EX-GES-05 — synthèse de résolution obligatoire à la clôture', () => {
  it('refuse une clôture sans synthèse, ou avec une synthèse indigente', async () => {
    const dossierId = await nouveauDossier()
    await placerAuStatut(dossierId, 'resolu')
    const acteurId = await acteur()

    // La borne est à 10 caractères après élagage : « trop court » en fait exactement 10 et
    // passerait, ce qui rendrait le test faussement rassurant.
    for (const synthese of ['', '   ', 'court', 'a'.repeat(9)]) {
      await expect(
        cloturer({ dossierId, acteurId, syntheseResolution: synthese })
      ).rejects.toBeInstanceOf(ErreurWorkflow)
    }

    // Le dossier n'a pas bougé : un refus de validation ne doit rien laisser derrière lui.
    const apres = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { date_cloture: true, synthese_resolution: true },
    })

    expect(apres.date_cloture).toBeNull()
    expect(apres.synthese_resolution).toBeNull()
  })
})
