import { prisma } from '@/lib/prisma'
import { PARCOURS_CODES, type ParcoursCode } from '@/server/authz'
import type { StatutAction } from '../action-corrective/action-corrective'

/** `String.raw` obligatoire : en littéral classique, `\M` et `\U` seraient supprimés. */
const MODEL_TYPE_USER = String.raw`App\Models\User`

/**
 * Qui a la charge d'un évènement indésirable.
 *
 * L'évènement indésirable n'est plus affecté à personne : son traitement revient au chargé de
 * sécurité DU SITE, qui le complète après chaque comité. « La personne en charge » ne peut donc
 * plus se lire dans `dossier_affectations` — cette table est vide pour ce parcours — et se déduit
 * du rattachement : le site du dossier, croisé avec les comptes qui en répondent.
 *
 * ⚠️ Renvoie une LISTE, pas une personne. Rien n'impose qu'un site n'ait qu'un chargé de sécurité,
 * et rien n'impose qu'il en ait un : les deux cas se produisent, et l'écran doit pouvoir dire
 * « personne » plutôt que d'afficher un vide qu'on lira comme un défaut d'affichage.
 *
 * ⚠️ Un compte SANS site est retenu pour tous les sites, et c'est cohérent avec
 * `siteCloisonnant()` : faute de rattachement, il n'est borné à aucun site et voit donc bien ce
 * dossier. L'écarter ici ferait dire à la fiche que personne n'en répond alors que quelqu'un le
 * traite.
 */
export async function chargesDeSecurite(siteId: bigint | null): Promise<{ id: bigint; nom: string }[]> {
  const liens = await prisma.model_has_roles.findMany({
    where: {
      model_type: MODEL_TYPE_USER,
      roles: { name: 'charge_securite', guard_name: 'web', actif: true },
    },
    select: { model_id: true },
  })

  if (liens.length === 0) return []

  const comptes = await prisma.users.findMany({
    where: {
      actif: true,
      id: { in: liens.map((l) => l.model_id) },
      // `site_id: null` inclus : voir l'avertissement ci-dessus.
      OR: siteId === null ? [{}] : [{ site_id: siteId }, { site_id: null }],
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return comptes.map((c) => ({ id: c.id, nom: c.name }))
}

export type SuiviEi = {
  /** Comptes qui répondent de cet évènement. Vide = personne, et l'écran doit le dire. */
  readonly enCharge: readonly { id: bigint; nom: string }[]
  /** Actions correctives ouvertes — le plan d'action, résumé. */
  readonly actionsOuvertes: number
  readonly actionsTotal: number
  /** Prochaine échéance d'action, `null` si aucune action ouverte n'en porte. */
  readonly prochaineEcheance: Date | null
  /** Actions ouvertes dont l'échéance est déjà passée. */
  readonly actionsEnRetard: number
}

/** Vrai pour le seul parcours qui reçoit ce bloc de suivi. */
export function estEvenementIndesirable(code: string): code is ParcoursCode {
  return (PARCOURS_CODES as readonly string[]).includes(code) && code === 'ei_employe'
}

/**
 * Le plan d'action et son responsable, pour l'encadré de suivi d'un évènement indésirable.
 *
 * Rassemble en un endroit ce que le métier demande de voir « pour chaque EI » : le délai, la
 * personne en charge, le plan d'action et la gravité. Les deux derniers vivaient déjà sur la
 * fiche, mais dispersés — la gravité en étiquette d'en-tête, le plan d'action dans un panneau
 * plus bas qu'il fallait dérouler. Le chargé de sécurité arrive après un comité avec une décision
 * à consigner : ce qu'il lui faut d'abord, c'est l'état d'ensemble.
 */
export async function suiviEi(dossierId: string, siteId: bigint | null): Promise<SuiviEi> {
  const [enCharge, actions] = await Promise.all([
    chargesDeSecurite(siteId),
    prisma.actions_correctives.findMany({
      where: { dossier_id: dossierId },
      select: { statut: true, echeance: true },
    }),
  ])

  /*
    « Ouverte » = tout sauf réalisée.

    Les quatre statuts viennent de `STATUTS_ACTION` : `non_demarree`, `en_cours`, `en_retard` et
    `realisee`. Seul le dernier est un aboutissement — `en_retard` est posé par le recalcul, pas
    choisi, et une action en retard attend plus que les autres, certainement pas moins.
  */
  const ouvertes = actions.filter((a) => (a.statut as StatutAction) !== 'realisee')

  const aujourdHui = new Date()
  const echeances = ouvertes
    .map((a) => a.echeance)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())

  return {
    enCharge,
    actionsOuvertes: ouvertes.length,
    actionsTotal: actions.length,
    prochaineEcheance: echeances[0] ?? null,
    actionsEnRetard: echeances.filter((d) => d < aujourdHui).length,
  }
}
