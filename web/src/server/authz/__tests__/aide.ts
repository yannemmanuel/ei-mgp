import type { Permission } from '../permissions'
import { ROLES, type Role } from '../roles'
import type { UtilisateurAutorise } from '../utilisateur'

let prochainId = 1n

/**
 * Fabrique un utilisateur autorisé à partir de ses rôles, en résolvant ses permissions
 * exactement comme le ferait `chargerUtilisateurAutorise()` depuis la base.
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
  return { id: prochainId++, actif: true, siteId: null, roles, permissions }
}

/** Le même utilisateur, rattaché à un site — pour les cas qui exercent le cloisonnement. */
export function utilisateurDuSite(siteId: bigint, ...roles: Role[]): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(...roles), siteId }
}
