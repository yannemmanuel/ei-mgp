import { prisma } from '@/lib/prisma'
import type { Permission } from './permissions'
import type { Role } from './roles'

/**
 * `model_type` utilisé par spatie/laravel-permission pour les comptes utilisateurs.
 *
 * `String.raw` est délibéré : en littéral classique, `'App\Models\User'` vaudrait
 * « AppModelsUser », car `\M` et `\U` ne sont pas des séquences d'échappement valides et
 * JavaScript supprime alors silencieusement les antislashs. Aucune erreur n'est levée — la
 * comparaison échoue simplement toujours, et l'utilisateur se retrouve sans aucun rôle.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`

const GUARD = 'web'

/**
 * Photographie des autorisations d'un utilisateur à un instant donné.
 *
 * Volontairement dérivée de la BASE à chaque vérification, jamais d'un jeton de session : c'est
 * exactement la sémantique de spatie/laravel-permission côté Laravel. Un changement de rôle ou
 * une désactivation prend ainsi effet immédiatement, sans attendre l'expiration d'un JWT.
 */
export type UtilisateurAutorise = {
  readonly id: bigint
  readonly actif: boolean
  readonly roles: readonly Role[]
  readonly permissions: ReadonlySet<Permission>
}

export function aRole(u: UtilisateurAutorise, role: Role): boolean {
  return u.roles.includes(role)
}

export function aUnRoleParmi(u: UtilisateurAutorise, roles: readonly Role[]): boolean {
  return roles.some((role) => u.roles.includes(role))
}

export function aPermission(u: UtilisateurAutorise, permission: Permission): boolean {
  return u.permissions.has(permission)
}

export function aUnePermissionParmi(u: UtilisateurAutorise, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => u.permissions.has(permission))
}

/**
 * Charge rôles et permissions effectives d'un utilisateur.
 *
 * Reproduit la résolution de spatie : permissions héritées des rôles UNION permissions
 * accordées directement à l'utilisateur (`model_has_permissions`). Cette seconde table est
 * vide aujourd'hui, mais le schéma l'autorise — l'ignorer ferait diverger silencieusement les
 * deux applications le jour où une permission directe serait accordée.
 *
 * Retourne `null` si l'utilisateur n'existe pas.
 */
export async function chargerUtilisateurAutorise(userId: bigint): Promise<UtilisateurAutorise | null> {
  const utilisateur = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, actif: true },
  })

  if (!utilisateur) {
    return null
  }

  const [liensRoles, permissionsDirectes] = await Promise.all([
    prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER, model_id: userId },
      select: {
        roles: {
          select: {
            name: true,
            guard_name: true,
            role_has_permissions: { select: { permissions: { select: { name: true, guard_name: true } } } },
          },
        },
      },
    }),
    prisma.model_has_permissions.findMany({
      where: { model_type: MODEL_TYPE_USER, model_id: userId },
      select: { permissions: { select: { name: true, guard_name: true } } },
    }),
  ])

  const roles: Role[] = []
  const permissions = new Set<Permission>()

  for (const lien of liensRoles) {
    if (lien.roles.guard_name !== GUARD) continue

    roles.push(lien.roles.name as Role)

    for (const rhp of lien.roles.role_has_permissions) {
      if (rhp.permissions.guard_name === GUARD) {
        permissions.add(rhp.permissions.name as Permission)
      }
    }
  }

  for (const directe of permissionsDirectes) {
    if (directe.permissions.guard_name === GUARD) {
      permissions.add(directe.permissions.name as Permission)
    }
  }

  return { id: utilisateur.id, actif: utilisateur.actif, roles, permissions }
}
