import { prisma } from '@/lib/prisma'
import { PERMISSIONS, ROLES, ROLE_NAMES, type Permission, type Role } from '@/server/authz'

/**
 * Matrice des habilitations : quel rôle détient quelle permission.
 *
 * **Lecture seule, et c'est un choix.** Les habilitations sont définies dans le CODE
 * (`server/authz/roles.ts`), pas en base : la base n'en est qu'un reflet, semé au déploiement.
 * Les rendre modifiables depuis l'application supprimerait le contrôle qui garantit aujourd'hui
 * que les deux ne divergent pas — un test compare les deux et a déjà détecté une dérive réelle
 * (2 associations manquantes, invisibles autrement).
 *
 * Ce module existe donc pour RENDRE VISIBLE ce que le code décide. Sans lui, savoir qui a le
 * droit de faire quoi suppose de lire un fichier TypeScript — ce qui n'est pas raisonnable pour
 * un DPO ou un auditeur, qui sont précisément les personnes à qui la question se pose.
 *
 * Il expose en outre l'écart entre le code et la base, s'il y en a un : une dérive silencieuse
 * signifie que les droits réellement appliqués ne sont pas ceux qui ont été décidés.
 */

export type LigneHabilitation = {
  readonly role: Role
  readonly permissions: readonly Permission[]
  /** Comptes actifs portant ce rôle — un rôle que personne ne porte mérite d'être questionné. */
  readonly comptes: number
}

export type EcartHabilitation = {
  readonly role: string
  /** Décidées dans le code, absentes de la base : le droit ne s'applique PAS. */
  readonly manquantes: string[]
  /** Présentes en base, absentes du code : un droit s'applique sans avoir été décidé. */
  readonly enTrop: string[]
}

export type Habilitations = {
  readonly lignes: LigneHabilitation[]
  readonly permissions: readonly Permission[]
  readonly ecarts: EcartHabilitation[]
}

const MODEL_TYPE_USER = String.raw`App\Models\User`

export async function chargerHabilitations(): Promise<Habilitations> {
  const [rolesEnBase, associations, comptesActifs] = await Promise.all([
    prisma.roles.findMany({
      select: {
        name: true,
        role_has_permissions: { select: { permissions: { select: { name: true } } } },
      },
    }),
    prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER },
      select: { model_id: true, roles: { select: { name: true } } },
    }),
    prisma.users.findMany({ where: { actif: true }, select: { id: true } }),
  ])

  // `model_has_roles` est la table polymorphe de Spatie : elle n'a pas de relation vers `users`,
  // seulement un `model_type` et un `model_id`. L'intersection se fait donc ici.
  const actifs = new Set(comptesActifs.map((u) => u.id))
  const effectifs = new Map<string, number>()

  for (const association of associations) {
    if (!actifs.has(association.model_id)) continue

    const nom = association.roles.name
    effectifs.set(nom, (effectifs.get(nom) ?? 0) + 1)
  }

  const lignes = ROLE_NAMES.map((role) => ({
    role,
    permissions: ROLES[role],
    comptes: effectifs.get(role) ?? 0,
  }))

  return { lignes, permissions: PERMISSIONS, ecarts: comparer(rolesEnBase) }
}

/**
 * Compare la décision (le code) et l'application (la base).
 *
 * Un écart n'est pas une erreur d'affichage : il signifie que les droits réellement appliqués ne
 * sont pas ceux qui ont été arrêtés. Le sens de l'écart compte — une permission manquante prive
 * quelqu'un d'un accès prévu, une permission en trop en accorde un qui ne l'a pas été.
 */
function comparer(
  rolesEnBase: { name: string; role_has_permissions: { permissions: { name: string } }[] }[]
): EcartHabilitation[] {
  const ecarts: EcartHabilitation[] = []

  for (const role of rolesEnBase) {
    const enBase = new Set(role.role_has_permissions.map((r) => r.permissions.name))
    const attendues = new Set<string>(ROLES[role.name as Role] ?? [])

    const manquantes = [...attendues].filter((p) => !enBase.has(p)).sort()
    const enTrop = [...enBase].filter((p) => !attendues.has(p)).sort()

    if (manquantes.length > 0 || enTrop.length > 0) {
      ecarts.push({ role: role.name, manquantes, enTrop })
    }
  }

  // Un rôle décidé mais absent de la base ne s'applique à personne.
  for (const role of ROLE_NAMES) {
    if (!rolesEnBase.some((r) => r.name === role)) {
      ecarts.push({ role, manquantes: [...ROLES[role]], enTrop: [] })
    }
  }

  return ecarts
}
