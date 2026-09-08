import { prisma } from '@/lib/prisma'
import { transitionAutorisee, transitionsDepuis, type StatutCode } from './statuts'
import { surChangementStatut } from '../notification/evenements'

/**
 * Machine à états des dossiers (CDC §7.1) — port de `App\Services\Workflow\DossierWorkflowService`.
 *
 * POINT D'ENTRÉE UNIQUE de toute transition de statut. Aucune page, aucune Server Action, aucune
 * tâche planifiée ne doit modifier `dossiers.statut_id` directement : c'est la seule garantie que
 * `historique_statuts` reste complet (RG-04) et que les règles de clôture (RG-10) et de
 * réouverture (RG-07) sont systématiquement vérifiées.
 */

export class ErreurWorkflow extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurWorkflow'
  }
}

type ClientTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Statuts atteignables manuellement depuis l'état courant, avec leurs libellés. */
export async function transitionsManuelles(statutActuel: StatutCode) {
  const codes = transitionsDepuis(statutActuel)

  if (codes.length === 0) return []

  return prisma.statuts_dossier.findMany({
    where: { code: { in: [...codes] } },
    orderBy: { ordre: 'asc' },
    select: { id: true, code: true, libelle_interne: true },
  })
}

async function statutCourant(tx: ClientTransaction, dossierId: string) {
  const dossier = await tx.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { id: true, statut_id: true, statuts_dossier: { select: { code: true } } },
  })

  return { ...dossier, code: dossier.statuts_dossier.code as StatutCode }
}

/**
 * Applique une transition et enregistre l'historique dans la MÊME transaction : un changement de
 * statut sans son entrée d'historique violerait RG-04, et l'inverse laisserait une trace
 * mensongère.
 */
async function appliquerTransition(
  tx: ClientTransaction,
  dossierId: string,
  statutPrecedentId: bigint,
  vers: StatutCode,
  acteurId: bigint | null,
  commentaire: string | null
): Promise<string> {
  const statutSuivant = await tx.statuts_dossier.findFirstOrThrow({ where: { code: vers } })

  await tx.dossiers.update({
    where: { id: dossierId },
    data: {
      statut_id: statutSuivant.id,
      updated_at: new Date(),
      // `date_cloture` n'est renseignée QUE par la clôture — jamais par un rejet. Toute la
      // mesure des délais de traitement (DT-31) et la politique de conservation (RG-11)
      // s'appuient sur cette distinction.
      ...(vers === 'cloture' ? { date_cloture: new Date() } : {}),
    },
  })

  await tx.historique_statuts.create({
    data: {
      dossier_id: dossierId,
      statut_precedent_id: statutPrecedentId,
      statut_suivant_id: statutSuivant.id,
      commentaire,
      effectue_par: acteurId,
      created_at: new Date(),
    },
  })

  // RGI-10 : le declarant ne recoit que le libelle AFFICHE, jamais le libelle interne.
  // Retourne plutot que notifie ici : notifier dans la transaction enverrait des messages pour
  // une transition qui pourrait encore etre annulee.
  return statutSuivant.libelle_affiche
}

/** Transition manuelle ordinaire, contrainte par le graphe (docs/workflows.md §1). */
export async function changerStatut(params: {
  dossierId: string
  vers: StatutCode
  acteurId: bigint
  commentaire?: string | null
}): Promise<void> {
  const libelleAffiche = await prisma.$transaction(async (tx) => {
    const actuel = await statutCourant(tx, params.dossierId)

    if (!transitionAutorisee(actuel.code, params.vers)) {
      throw new ErreurWorkflow(`Transition non autorisée : ${actuel.code} → ${params.vers}.`)
    }

    return appliquerTransition(
      tx,
      params.dossierId,
      actuel.statut_id,
      params.vers,
      params.acteurId,
      params.commentaire ?? null
    )
  })

  // EX-NOT-02 : notification du declarant identifie, apres commit.
  await surChangementStatut(params.dossierId, libelleAffiche)
}

/**
 * RG-10 / EX-ACT-05 : un dossier n'est clôturable que si TOUTES ses actions correctives sont
 * closes et leur efficacité vérifiée. N'exige pas qu'il en existe : un dossier sans action
 * corrective formelle reste clôturable.
 */
export async function cloturer(params: {
  dossierId: string
  acteurId: bigint
  syntheseResolution: string
}): Promise<void> {
  if (params.syntheseResolution.trim().length < 10) {
    throw new ErreurWorkflow('La synthèse de résolution est obligatoire (10 caractères minimum).')
  }

  const libelleAffiche = await prisma.$transaction(async (tx) => {
    const actuel = await statutCourant(tx, params.dossierId)

    if (actuel.code !== 'resolu') {
      throw new ErreurWorkflow('Seul un dossier « Résolu » peut être clôturé.')
    }

    const actionsNonCloses = await tx.actions_correctives.count({
      where: {
        dossier_id: params.dossierId,
        OR: [{ date_cloture: null }, { NOT: { verification_efficacite: true } }],
      },
    })

    if (actionsNonCloses > 0) {
      throw new ErreurWorkflow(
        'Toutes les actions correctives doivent être closes et vérifiées avant de clôturer.'
      )
    }

    await tx.dossiers.update({
      where: { id: params.dossierId },
      data: { synthese_resolution: params.syntheseResolution },
    })

    return appliquerTransition(
      tx,
      params.dossierId,
      actuel.statut_id,
      'cloture',
      params.acteurId,
      'Dossier clôturé.'
    )
  })

  await surChangementStatut(params.dossierId, libelleAffiche)
}

/** RG-07 : réservé aux porteurs de `dossiers.reopen` (vérifié par la policy), motif obligatoire. */
export async function reouvrir(params: {
  dossierId: string
  acteurId: bigint
  motif: string
}): Promise<void> {
  if (params.motif.trim().length < 5) {
    throw new ErreurWorkflow('Le motif de réouverture est obligatoire.')
  }

  const libelleAffiche = await prisma.$transaction(async (tx) => {
    const actuel = await statutCourant(tx, params.dossierId)

    if (actuel.code !== 'cloture') {
      throw new ErreurWorkflow('Seul un dossier « Clôturé » peut être réouvert.')
    }

    await tx.dossiers.update({
      where: { id: params.dossierId },
      data: { motif_reouverture: params.motif },
    })

    return appliquerTransition(
      tx,
      params.dossierId,
      actuel.statut_id,
      'reouvert',
      params.acteurId,
      `Dossier réouvert : ${params.motif}`
    )
  })

  await surChangementStatut(params.dossierId, libelleAffiche)
}

/** Rejet pour non-recevabilité, possible uniquement depuis « En analyse », motif obligatoire. */
export async function rejeter(params: {
  dossierId: string
  acteurId: bigint
  motif: string
}): Promise<void> {
  if (params.motif.trim().length < 5) {
    throw new ErreurWorkflow('Le motif de rejet est obligatoire.')
  }

  const libelleAffiche = await prisma.$transaction(async (tx) => {
    const actuel = await statutCourant(tx, params.dossierId)

    if (actuel.code !== 'en_analyse') {
      throw new ErreurWorkflow('Seul un dossier « En analyse » peut être rejeté.')
    }

    await tx.dossiers.update({
      where: { id: params.dossierId },
      data: { motif_rejet: params.motif },
    })

    return appliquerTransition(
      tx,
      params.dossierId,
      actuel.statut_id,
      'rejete',
      params.acteurId,
      `Dossier jugé non recevable : ${params.motif}`
    )
  })

  // RGI-11 : côté déclarant, un dossier rejeté s'affiche comme « Clôturé » — c'est le libellé
  // affiché qui est notifié, jamais le libellé interne.
  await surChangementStatut(params.dossierId, libelleAffiche)
}
