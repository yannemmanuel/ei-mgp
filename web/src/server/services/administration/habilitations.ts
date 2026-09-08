import { prisma } from '@/lib/prisma'
import { PERMISSIONS, ROLES, ROLE_NAMES, type Permission, type Role } from '@/server/authz'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser } from '../audit/journal'

/** Garde Spatie : les lignes d'un autre garde ne concernent pas cette application. */
const GUARD = 'web'

/**
 * Matrice des habilitations : quel rôle détient quelle permission.
 *
 * **La base fait foi.** `chargerUtilisateurAutorise()` lit `role_has_permissions` à chaque
 * requête : ce que montre cet écran est donc ce qui s'applique réellement, et une modification
 * prend effet immédiatement.
 *
 * `server/authz/roles.ts` reste la configuration de RÉFÉRENCE — celle livrée au déploiement. Le
 * code garde la main sur ce qui EXISTE (le catalogue fermé des permissions et des rôles), la base
 * sur qui obtient quoi. L'écart entre les deux est affiché : il ne signale plus une anomalie mais
 * l'historique des ajustements, et permet de revenir à la référence en connaissance de cause.
 */

export type LigneHabilitation = {
  readonly role: Role
  /** Ce qui S'APPLIQUE : lu en base, pas dans le code. */
  readonly permissions: readonly Permission[]
  /** Ce qui a été LIVRÉ : la configuration de référence, pour situer les ajustements. */
  readonly reference: readonly Permission[]
  /** Comptes actifs portant ce rôle — un rôle que personne ne porte mérite d'être questionné. */
  readonly comptes: number
}

export type EcartHabilitation = {
  readonly role: string
  /** Présentes dans la référence, retirées depuis : ces droits ne s'appliquent plus. */
  readonly retirees: string[]
  /** Absentes de la référence, ajoutées depuis : ces droits s'appliquent en plus. */
  readonly ajoutees: string[]
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

  const enBaseParRole = new Map(
    rolesEnBase.map((r) => [
      r.name,
      r.role_has_permissions.map((rhp) => rhp.permissions.name as Permission).sort(),
    ])
  )

  const lignes = ROLE_NAMES.map((role) => ({
    role,
    permissions: enBaseParRole.get(role) ?? [],
    reference: ROLES[role],
    comptes: effectifs.get(role) ?? 0,
  }))

  return { lignes, permissions: PERMISSIONS, ecarts: comparer(rolesEnBase) }
}

/**
 * Compare la configuration de référence (le code) à ce qui s'applique (la base).
 *
 * Le sens de l'écart compte : une permission retirée prive d'un accès prévu à la livraison, une
 * permission ajoutée en accorde un qui ne l'était pas. Aucun des deux n'est fautif en soi — mais
 * les deux méritent d'être vus, et le journal d'audit dit qui les a décidés.
 */
function comparer(
  rolesEnBase: { name: string; role_has_permissions: { permissions: { name: string } }[] }[]
): EcartHabilitation[] {
  const ecarts: EcartHabilitation[] = []

  for (const role of rolesEnBase) {
    const enBase = new Set(role.role_has_permissions.map((r) => r.permissions.name))
    const attendues = new Set<string>(ROLES[role.name as Role] ?? [])

    const retirees = [...attendues].filter((p) => !enBase.has(p)).sort()
    const ajoutees = [...enBase].filter((p) => !attendues.has(p)).sort()

    if (retirees.length > 0 || ajoutees.length > 0) {
      ecarts.push({ role: role.name, retirees, ajoutees })
    }
  }

  // Un rôle décidé mais absent de la base ne s'applique à personne.
  for (const role of ROLE_NAMES) {
    if (!rolesEnBase.some((r) => r.name === role)) {
      ecarts.push({ role, retirees: [...ROLES[role]], ajoutees: [] })
    }
  }

  return ecarts
}

/**
 * Modifie les permissions d'un rôle.
 *
 * **La base fait foi à l'exécution** : `chargerUtilisateurAutorise()` lit `role_has_permissions`
 * à chaque requête. Une modification prend donc effet immédiatement, pour tout le monde, sans
 * redéploiement — c'est puissant, et c'est pourquoi trois garde-fous encadrent l'opération.
 *
 * 1. **Le catalogue reste fermé.** Le code décide quelles permissions et quels rôles EXISTENT ;
 *    la base décide seulement qui obtient quoi. Un nom forgé ne peut pas créer d'association.
 * 2. **Personne ne peut se verrouiller dehors.** Au moins un compte actif doit conserver
 *    `roles.manage` après la modification — sinon plus aucune interface ne permettrait de
 *    revenir en arrière, et il n'y a plus d'application Laravel ni de commande pour le faire.
 * 3. **Tout changement est tracé.** L'audit remplace la comparaison automatique code/base qui
 *    protégeait ces associations tant qu'elles étaient figées : un droit accordé ou retiré doit
 *    rester explicable, avec son auteur et sa date.
 */
export async function modifierPermissionsRole(
  acteur: { id: bigint },
  role: string,
  permissionsVoulues: readonly string[]
): Promise<void> {
  if (!ROLE_NAMES.includes(role as Role)) {
    throw new ErreurWorkflow('Rôle inconnu.')
  }

  const inconnues = permissionsVoulues.filter((p) => !PERMISSIONS.includes(p as Permission))

  if (inconnues.length > 0) {
    throw new ErreurWorkflow(`Permission inconnue : ${inconnues.join(', ')}.`)
  }

  const ligneRole = await prisma.roles.findFirstOrThrow({
    where: { name: role, guard_name: GUARD },
    select: { id: true, role_has_permissions: { select: { permissions: { select: { id: true, name: true } } } } },
  })

  const actuelles = new Map(
    ligneRole.role_has_permissions.map((r) => [r.permissions.name, r.permissions.id])
  )
  const voulues = new Set(permissionsVoulues)

  const aRetirer = [...actuelles.entries()].filter(([nom]) => !voulues.has(nom))
  const aAjouter = [...voulues].filter((nom) => !actuelles.has(nom))

  if (aRetirer.length === 0 && aAjouter.length === 0) return

  await verifierQuUnAdministrateurSubsiste(role, voulues)

  if (aRetirer.length > 0) {
    await prisma.role_has_permissions.deleteMany({
      where: { role_id: ligneRole.id, permission_id: { in: aRetirer.map(([, id]) => id) } },
    })
  }

  if (aAjouter.length > 0) {
    const lignes = await prisma.permissions.findMany({
      where: { name: { in: aAjouter }, guard_name: GUARD },
      select: { id: true },
    })

    await prisma.role_has_permissions.createMany({
      data: lignes.map((p) => ({ role_id: ligneRole.id, permission_id: p.id })),
    })
  }

  await journaliser({
    action: 'role.permissions_modifiees',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligneRole.id),
    anciennes: { role, permissions: [...actuelles.keys()].sort() },
    nouvelles: { role, permissions: [...voulues].sort() },
  })
}

/**
 * Refuse une modification qui priverait le dispositif de tout administrateur.
 *
 * Sans application Laravel ni commande en ligne, retirer `roles.manage` au dernier rôle qui le
 * porte rendrait la situation irréversible depuis l'application : personne ne pourrait plus le
 * rétablir.
 */
async function verifierQuUnAdministrateurSubsiste(
  roleModifie: string,
  permissionsVoulues: ReadonlySet<string>
): Promise<void> {
  const CLE = 'roles.manage'

  // Le rôle modifié conserve la clé : rien ne peut être perdu.
  if (permissionsVoulues.has(CLE)) return

  const autresPorteurs = await prisma.roles.findMany({
    where: {
      guard_name: GUARD,
      NOT: { name: roleModifie },
      role_has_permissions: { some: { permissions: { name: CLE, guard_name: GUARD } } },
    },
    select: { name: true },
  })

  if (autresPorteurs.length === 0) {
    throw new ErreurWorkflow(
      `Impossible : « ${roleModifie} » est le dernier rôle habilité à gérer les habilitations. Le retirer rendrait cet écran inaccessible à tous, définitivement.`
    )
  }

  const associations = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, roles: { name: { in: autresPorteurs.map((r) => r.name) } } },
    select: { model_id: true },
  })

  const comptesActifs = await prisma.users.count({
    where: { actif: true, id: { in: associations.map((a) => a.model_id) } },
  })

  if (comptesActifs === 0) {
    throw new ErreurWorkflow(
      `Impossible : aucun compte actif ne porterait plus la gestion des habilitations. Attribuez d'abord un rôle habilité à un compte actif.`
    )
  }
}
