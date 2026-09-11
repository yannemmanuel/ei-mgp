import { PARCOURS_CODES, type ParcoursCode } from '../parcours'
import type { Permission } from '../permissions'
import { ROLES, type Role } from '../roles'
import type { UtilisateurAutorise } from '../utilisateur'

let prochainId = 1n

/**
 * Fabrique un utilisateur autorisé à partir de ses rôles, en résolvant ses permissions
 * exactement comme le ferait `chargerUtilisateurAutorise()` depuis la base.
 *
 * ⚠️ Les 4 parcours lui sont attribués — ce n'est PAS l'état d'un compte réel, qui n'en a aucun
 * tant qu'on ne lui en a pas confié. Ce choix isole le verrou exercé ici : avec tout attribué, le
 * périmètre se réduit à ce que les rôles ouvrent, et ces cas continuent donc de mesurer le
 * cloisonnement PAR RÔLE, seul objet de leur assertion.
 *
 * Pour exercer l'attribution elle-même — le fait qu'un compte sans parcours ne voit rien —, il
 * faut `utilisateurAvecParcours()`, qui oblige à l'énoncer.
 */
export function utilisateurAvecRoles(...roles: Role[]): UtilisateurAutorise {
  const permissions = new Set<Permission>()
  for (const role of roles) {
    for (const permission of ROLES[role]) {
      permissions.add(permission)
    }
  }

  // Sans site : le cloisonnement par site ne s'applique donc pas par défaut, et les cas qui le
  // visent le posent explicitement. Un défaut arbitraire ferait passer pour du cloisonnement ce
  // qui ne serait qu'un effet de l'outillage.
  return {
    id: prochainId++,
    actif: true,
    siteId: null,
    doitChangerMotDePasse: false,
    roles,
    permissions,
    parcours: [...PARCOURS_CODES],
  }
}

/**
 * Le même utilisateur, avec les parcours qu'on lui a EXPLICITEMENT confiés.
 *
 * Passer une liste vide décrit le compte tout juste créé : des rôles, aucune attribution. C'est
 * l'état normal d'un compte tant qu'un administrateur ne l'a pas habilité, et il ne doit alors
 * ouvrir aucun dossier.
 */
export function utilisateurAvecParcours(
  parcours: readonly ParcoursCode[],
  ...roles: Role[]
): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(...roles), parcours }
}

/** Le même utilisateur, rattaché à un site — pour les cas qui exercent le cloisonnement. */
export function utilisateurDuSite(siteId: bigint, ...roles: Role[]): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(...roles), siteId }
}
