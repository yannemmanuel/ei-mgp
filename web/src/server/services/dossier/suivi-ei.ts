import { prisma } from '@/lib/prisma'
import {
  directionCloisonnante,
  PARCOURS_CODES,
  rattachementCouvre,
  siteCloisonnant,
  type ParcoursCode,
  type Permission,
  type Role,
  type UtilisateurAutorise,
} from '@/server/authz'
import type { StatutAction } from '../action-corrective/action-corrective'

/** `String.raw` obligatoire : en littéral classique, `\M` et `\U` seraient supprimés. */
const MODEL_TYPE_USER = String.raw`App\Models\User`

/** Le rattachement d'un dossier : les deux seules entrées du cloisonnement. */
export type RattachementDossier = {
  readonly siteId: bigint | null
  readonly directionId: bigint | null
}

/**
 * Qui a la charge d'un évènement indésirable.
 *
 * L'évènement indésirable n'est affecté à personne : son traitement revient au chargé de sécurité
 * dont le RATTACHEMENT couvre le dossier, et qui le complète après chaque comité. « La personne en
 * charge » ne se lit donc pas dans `dossier_affectations` — cette table est vide pour ce parcours —
 * mais se déduit du rattachement.
 *
 * ⚠️ Renvoie une LISTE, pas une personne. Rien n'impose qu'un rattachement n'ait qu'un chargé de
 * sécurité, ni qu'il en ait un : les deux cas se produisent, et l'écran doit pouvoir dire
 * « personne » plutôt que d'afficher un vide qu'on lira comme un défaut d'affichage.
 *
 * ⚠️ FILTRÉ PAR `rattachementCouvre()`, la même fonction que l'affectation et la lecture. Les deux
 * versions précédentes filtraient à la main, et toutes deux se trompaient :
 *
 *   - elles ignoraient la DIRECTION, donc un chargé de sécurité habilité sur une direction
 *     n'apparaissait jamais — alors que c'est lui qui répond du dossier ;
 *   - elles écrivaient `OR: [{}]` pour « tous les comptes » quand le dossier n'avait pas de site.
 *     Dans Prisma, un objet vide dans un `OR` ne correspond à RIEN, pas à tout : la fiche disait
 *     donc que personne n'en répondait, sur la majorité des dossiers.
 */
/** Un chargé de sécurité, accompagné de quoi décider s'il répond d'un dossier donné. */
export type CompteEnCharge = {
  readonly id: bigint
  readonly nom: string
  readonly pourCloisonnement: UtilisateurAutorise
}

/**
 * Tous les chargés de sécurité actifs, chargés UNE fois.
 *
 * Séparé de `chargesDeSecurite()` parce que le tableau de bord pose la question sur beaucoup de
 * dossiers à la fois : la liste se charge une fois, puis chaque dossier se décide en mémoire. La
 * même fonction appelée par dossier ferait une requête par ligne sur l'écran le plus visité.
 */
export async function comptesEnChargeDesEi(): Promise<CompteEnCharge[]> {
  const porteurs = await prisma.model_has_roles.findMany({
    where: {
      model_type: MODEL_TYPE_USER,
      roles: { name: 'charge_securite', guard_name: 'web', actif: true },
    },
    select: { model_id: true },
  })

  if (porteurs.length === 0) return []

  const ids = porteurs.map((l) => l.model_id)


  const comptes = await prisma.users.findMany({
    where: { actif: true, id: { in: ids } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      site_id: true,
      direction_id: true,
      directions: { select: { site_id: true } },
    },
  })

  /*
    TOUS les rôles et permissions de ces comptes, en une requête.

    `rattachementCouvre()` ne borne pas un compte transverse ni un compte qui cumule un rôle non
    cloisonné : sans cette lecture, on lui appliquerait une restriction qui ne le concerne pas, et
    la fiche cesserait de nommer quelqu'un qui en répond bel et bien.
  */
  const liens = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: ids } },
    select: {
      model_id: true,
      roles: {
        select: {
          name: true,
          actif: true,
          guard_name: true,
          role_has_permissions: {
            select: { permissions: { select: { name: true, guard_name: true } } },
          },
        },
      },
    },
  })

  const rolesParCompte = new Map<bigint, Role[]>()
  const permissionsParCompte = new Map<bigint, Set<Permission>>()

  for (const lien of liens) {
    // Un rôle désactivé ne confère rien, exactement comme dans `chargerUtilisateurAutorise()`.
    if (!lien.roles.actif || lien.roles.guard_name !== 'web') continue

    rolesParCompte.set(lien.model_id, [
      ...(rolesParCompte.get(lien.model_id) ?? []),
      lien.roles.name as Role,
    ])

    const permissions = permissionsParCompte.get(lien.model_id) ?? new Set<Permission>()
    for (const rhp of lien.roles.role_has_permissions) {
      if (rhp.permissions.guard_name === 'web') permissions.add(rhp.permissions.name as Permission)
    }
    permissionsParCompte.set(lien.model_id, permissions)
  }

  return comptes.map((c) => ({
    id: c.id,
    nom: c.name,
    pourCloisonnement: {
      id: c.id,
      actif: true,
      siteId: c.site_id ?? c.directions?.site_id ?? null,
      directionId: c.direction_id,
      doitChangerMotDePasse: false,
      roles: rolesParCompte.get(c.id) ?? [],
      permissions: permissionsParCompte.get(c.id) ?? new Set<Permission>(),
      parcours: [],
    },
  }))
}

/** Ceux d'entre eux dont le rattachement couvre CE dossier. */
export async function chargesDeSecurite(
  dossier: RattachementDossier
): Promise<{ id: bigint; nom: string }[]> {
  const candidats = await comptesEnChargeDesEi()

  return candidats
    .filter((c) => rattachementCouvre(c.pourCloisonnement, dossier))
    .map((c) => ({ id: c.id, nom: c.nom }))
}

/**
 * Ce que les chargés de sécurité couvrent, résumé en trois valeurs exploitables en SQL.
 *
 * Décider en mémoire, dossier par dossier, convient à une fiche ; pas à une liste paginée ni à un
 * compteur. Ce résumé permet d'exprimer « les EI dont personne ne répond » comme une CLAUSE, donc
 * de la partager entre le tableau de bord et la liste qu'il ouvre.
 */
export type CouvertureEi = {
  /** Un chargé sans rattachement couvre TOUT : aucun EI n'est alors orphelin. */
  readonly toutCouvert: boolean
  readonly directions: readonly bigint[]
  readonly sites: readonly bigint[]
}

export async function couvertureDesEi(): Promise<CouvertureEi> {
  const candidats = await comptesEnChargeDesEi()

  const directions: bigint[] = []
  const sites: bigint[] = []
  let toutCouvert = false

  for (const c of candidats) {
    // Même ordre que `rattachementCouvre()` : la direction d'abord, le site ensuite.
    const direction = directionCloisonnante(c.pourCloisonnement)
    if (direction !== null) {
      directions.push(direction)
      continue
    }

    const site = siteCloisonnant(c.pourCloisonnement)
    if (site !== null) {
      sites.push(site)
      continue
    }

    toutCouvert = true
  }

  return { toutCouvert, directions, sites }
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
export async function suiviEi(
  dossierId: string,
  dossier: RattachementDossier
): Promise<SuiviEi> {
  const [enCharge, actions] = await Promise.all([
    chargesDeSecurite(dossier),
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
