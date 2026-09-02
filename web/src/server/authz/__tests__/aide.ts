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

  return { id: prochainId++, actif: true, roles, permissions }
}
