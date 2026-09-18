import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import { changerStatut as changerStatutDossier, ErreurWorkflow } from '../dossier/workflow'
import type { StatutCode } from '../dossier/statuts'

/**
 * Cycle de vie d'une action corrective (CDC §9.6, EX-ACT-01 à 05) — port de
 * `App\Services\ActionCorrective\ActionCorrectiveService`.
 *
 * POINT D'ENTRÉE UNIQUE. La transition automatique du dossier « Action corrective en cours » →
 * « Résolu » est déclenchée ICI, en réaction à la clôture de la dernière action encore ouverte —
 * jamais par une tâche planifiée indépendante (DT-27).
 */

export const STATUTS_ACTION = ['non_demarree', 'en_cours', 'realisee', 'en_retard'] as const
export type StatutAction = (typeof STATUTS_ACTION)[number]

/** EX-ACT-03 : suivi d'avancement. « En retard » est posé par le recalcul, pas choisi à la main. */
const TRANSITIONS_AUTORISEES: Partial<Record<StatutAction, readonly StatutAction[]>> = {
  non_demarree: ['en_cours'],
  en_cours: ['realisee'],
  en_retard: ['en_cours', 'realisee'],
}

function jourDe(date: Date): number {
  const copie = new Date(date)
  copie.setHours(0, 0, 0, 0)
  return copie.getTime()
}

/**
 * EX-ACT-01/02 : création depuis les recommandations d'une investigation, avec responsable et
 * échéance. RGI-07 : l'échéance doit être postérieure à la date de création.
 *
 * ⚠️ LE RESPONSABLE EST SAISI À LA MAIN (décision métier du 2026-09-18), et non choisi parmi les
 * comptes. Celui qui met en œuvre une mesure — chef d'équipe, prestataire, service entier — n'est
 * pas forcément un utilisateur de la plateforme ; l'exiger revenait à ne pouvoir confier une
 * action qu'aux personnes déjà connues du système.
 */
export async function creerAction(params: {
  dossierId: string
  investigationId?: string | null
  intitule: string
  description: string
  responsableNom: string
  echeance: Date
}): Promise<string> {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: params.dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  if ((dossier.statuts_dossier.code as StatutCode) !== 'action_corrective_en_cours') {
    throw new ErreurWorkflow(
      'Une action corrective ne peut être créée que sur un dossier « Action corrective en cours ».'
    )
  }

  if (params.investigationId) {
    /*
      ⚠️ CE FILTRE EST UN CONTRÔLE DE SÉCURITÉ, pas une commodité : rattachée au MÊME dossier.
      Sans lui, un identifiant forgé rattacherait l'action à l'investigation d'un autre dossier —
      et la ferait donc apparaître dans une fiche que son auteur n'a pas le droit de lire.

      Il ne reste que ce contrôle : le statut de l'investigation n'est plus regardé, puisqu'une
      investigation n'est plus validée. Toutes les fiches du dossier peuvent en être la source.
    */
    const investigation = await prisma.investigations.findFirst({
      where: { id: params.investigationId, dossier_id: params.dossierId },
      select: { id: true },
    })

    if (!investigation) {
      throw new ErreurWorkflow('Investigation introuvable pour ce dossier.')
    }
  }

  if (jourDe(params.echeance) <= jourDe(new Date())) {
    throw new ErreurWorkflow(
      'La date d’échéance doit être postérieure à la date de création.'
    )
  }

  if (params.intitule.trim() === '' || params.description.trim() === '') {
    throw new ErreurWorkflow('L’intitulé et la description sont obligatoires.')
  }

  // Le responsable reste OBLIGATOIRE : seule la façon de le désigner change. Une action sans
  // personne qui en répond ne serait suivie par personne.
  const responsableNom = params.responsableNom.trim()

  if (responsableNom === '') {
    throw new ErreurWorkflow('Le responsable de l’action est obligatoire.')
  }

  const maintenant = new Date()

  const action = await prisma.actions_correctives.create({
    data: {
      id: ulid().toLowerCase(),
      dossier_id: params.dossierId,
      investigation_id: params.investigationId || null,
      intitule: params.intitule,
      description: params.description,
      responsable_nom: responsableNom,
      // `responsable_id` reste NULL : le responsable n'est plus un compte. La colonne subsiste
      // pour les lignes écrites avant le 2026-09-18, qui pointent encore vers un utilisateur.
      responsable_id: null,
      echeance: params.echeance,
      statut: 'non_demarree',
      created_at: maintenant,
      updated_at: maintenant,
    },
    select: { id: true },
  })

  return action.id
}

/** EX-ACT-03 : avancement, contraint par le graphe de transitions. */
export async function changerStatutAction(params: {
  actionId: string
  vers: StatutAction
}): Promise<void> {
  const action = await prisma.actions_correctives.findUniqueOrThrow({
    where: { id: params.actionId },
    select: { statut: true },
  })

  const actuel = action.statut as StatutAction
  const autorises = TRANSITIONS_AUTORISEES[actuel] ?? []

  if (!autorises.includes(params.vers)) {
    throw new ErreurWorkflow(`Transition non autorisée : ${actuel} → ${params.vers}.`)
  }

  await prisma.actions_correctives.update({
    where: { id: params.actionId },
    data: { statut: params.vers, updated_at: new Date() },
  })
}

/**
 * EX-ACT-04 : l'efficacité ne se vérifie qu'une fois l'action réalisée.
 * RGI-08 : une vérification POSITIVE exige un commentaire — une efficacité affirmée sans
 * justification ne serait pas auditable.
 */
export async function verifierEfficacite(params: {
  actionId: string
  efficace: boolean
  commentaire?: string | null
}): Promise<void> {
  const action = await prisma.actions_correctives.findUniqueOrThrow({
    where: { id: params.actionId },
    select: { statut: true },
  })

  if ((action.statut as StatutAction) !== 'realisee') {
    throw new ErreurWorkflow(
      'L’efficacité ne peut être vérifiée qu’une fois l’action réalisée (EX-ACT-04).'
    )
  }

  if (params.efficace && (params.commentaire ?? '').trim() === '') {
    throw new ErreurWorkflow(
      'Un commentaire est obligatoire quand la vérification est positive.'
    )
  }

  await prisma.actions_correctives.update({
    where: { id: params.actionId },
    data: {
      verification_efficacite: params.efficace,
      verification_commentaire: params.commentaire ?? null,
      updated_at: new Date(),
    },
  })
}

/**
 * RGI-09 : la clôture n'est possible qu'après une vérification d'efficacité positive.
 * EX-ACT-05 : dès que toutes les actions du dossier sont closes, celui-ci avance
 * automatiquement à « Résolu » (DT-27).
 */
export async function cloturerAction(params: {
  actionId: string
  acteurId: bigint
}): Promise<void> {
  const action = await prisma.actions_correctives.findUniqueOrThrow({
    where: { id: params.actionId },
    select: { verification_efficacite: true, dossier_id: true },
  })

  if (action.verification_efficacite !== true) {
    throw new ErreurWorkflow(
      'Une action ne peut être clôturée qu’après une vérification positive.'
    )
  }

  await prisma.actions_correctives.update({
    where: { id: params.actionId },
    data: { date_cloture: new Date(), updated_at: new Date() },
  })

  await avancerDossierSiToutesActionsClosees(action.dossier_id, params.acteurId)
}

async function avancerDossierSiToutesActionsClosees(
  dossierId: string,
  acteurId: bigint
): Promise<void> {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  if ((dossier.statuts_dossier.code as StatutCode) !== 'action_corrective_en_cours') {
    return
  }

  const resteOuvertes = await prisma.actions_correctives.count({
    where: {
      dossier_id: dossierId,
      OR: [{ date_cloture: null }, { NOT: { verification_efficacite: true } }],
    },
  })

  if (resteOuvertes > 0) return

  await changerStatutDossier({
    dossierId,
    vers: 'resolu',
    acteurId,
    commentaire:
      'Transition automatique : toutes les actions correctives sont closes et vérifiées efficaces (EX-ACT-05).',
  })
}

/**
 * EX-ACT-03 : bascule en « en retard » les actions non abouties dont l'échéance est passée.
 * Exécuté par une tâche planifiée (étape 12).
 *
 * Ne touche JAMAIS une action « réalisée » : son échéance est derrière elle, mais le travail est
 * fait — la marquer en retard serait faux.
 */
export async function recalculerRetards(): Promise<number> {
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)

  const resultat = await prisma.actions_correctives.updateMany({
    where: {
      statut: { in: ['non_demarree', 'en_cours'] },
      echeance: { lt: aujourdhui },
    },
    data: { statut: 'en_retard', updated_at: new Date() },
  })

  return resultat.count
}

/** Actions correctives d'un dossier, avec leur responsable et leur investigation d'origine. */
export async function actionsDuDossier(dossierId: string) {
  return prisma.actions_correctives.findMany({
    where: { dossier_id: dossierId },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      intitule: true,
      description: true,
      echeance: true,
      statut: true,
      verification_efficacite: true,
      verification_commentaire: true,
      date_cloture: true,
      investigation_id: true,
      responsable_nom: true,
      // ⚠️ La relation est CONSERVÉE pour les actions créées avant la saisie manuelle. La reprise
      // a recopié leur nom dans `responsable_nom`, mais la lire ici garde l'affichage juste même
      // si une ligne échappait à cette reprise.
      users: { select: { name: true } },
    },
  })
}

/**
 * Investigations du dossier pouvant être la source d'une action (EX-ACT-01).
 *
 * ⚠️ TOUTES les fiches du dossier, sans condition de statut : une investigation n'est plus
 * soumise à validation. Le filtre `statut: 'validee'` qui se trouvait ici ne laissait remonter
 * que les fiches validées — il ne rendrait plus aucune ligne éligible.
 */
export async function investigationsRattachables(dossierId: string) {
  return prisma.investigations.findMany({
    where: { dossier_id: dossierId },
    orderBy: { created_at: 'asc' },
    select: { id: true, date_ouverture: true },
  })
}
