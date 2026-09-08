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
  /** Site de rattachement, `null` s'il n'est pas renseigné. Voir `authz/site.ts`. */
  readonly siteId: bigint | null
  /**
   * Le mot de passe a été fixé par un tiers — création de compte ou régénération — et n'a pas
   * encore été remplacé par son porteur. La coquille du back-office l'oriente alors vers l'écran
   * de changement, et n'en laisse sortir qu'une fois le remplacement fait.
   */
  readonly doitChangerMotDePasse: boolean
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
 * ⚠️ Une permission accordée DIRECTEMENT à un compte ne transite par aucun rôle : désactiver un
 * rôle ne la retire donc pas. C'est cohérent — elle n'a jamais été conférée par lui — mais il
 * faut le savoir avant de compter sur la désactivation pour couper un accès.
 *
 * Retourne `null` si l'utilisateur n'existe pas.
 */
export async function chargerUtilisateurAutorise(userId: bigint): Promise<UtilisateurAutorise | null> {
  const utilisateur = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, actif: true, site_id: true, doit_changer_mot_de_passe: true },
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
            actif: true,
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

    // Un rôle désactivé ne confère RIEN — ni permission, ni parcours.
    //
    // C'est ici que la désactivation prend son sens, et nulle part ailleurs : masquer le rôle
    // dans les écrans d'administration n'en retirerait aucun droit, et un compte qui le porte
    // continuerait d'accéder à tout. L'association `model_has_roles` est conservée : réactiver
    // le rôle rend leurs droits à ceux qui le portaient, sans avoir à les réattribuer un par un.
    //
    // Le rôle est aussi retiré de `roles`, pas seulement ses permissions : `parcoursAutorises()`
    // et `aRole()` s'appuient dessus, et un rôle éteint qui continuerait d'ouvrir un parcours
    // serait le pire des deux mondes.
    if (!lien.roles.actif) continue

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

  return {
    id: utilisateur.id,
    actif: utilisateur.actif,
    siteId: utilisateur.site_id,
    doitChangerMotDePasse: utilisateur.doit_changer_mot_de_passe,
    roles,
    permissions,
  }
}
