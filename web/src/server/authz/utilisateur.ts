import { prisma } from '@/lib/prisma'
import type { ParcoursCode } from './parcours'
import { cloisonnePourSesRoles, donneAccesAuxDossiers } from './site'
import type { Permission } from './permissions'
import type { Role } from './roles'
import { MODELES } from '@/server/modeles'

const MODEL_TYPE_USER = MODELES.utilisateur

/**
 * Photographie des autorisations d'un utilisateur à un instant donné.
 *
 * Volontairement dérivée de la BASE à chaque vérification, jamais d'un jeton de session. Un
 * changement de rôle ou une désactivation prend ainsi effet immédiatement, sans attendre
 * l'expiration d'un JWT.
 */
export type UtilisateurAutorise = {
  readonly id: bigint
  readonly actif: boolean
  /** Site de rattachement, `null` s'il n'est pas renseigné. Voir `authz/site.ts`. */
  readonly siteId: bigint | null
  /** Direction de rattachement, `null` si habilité sur un site entier. Prioritaire sur le site. */
  readonly directionId: bigint | null
  /**
   * Le mot de passe a été fixé par un tiers — création de compte ou régénération — et n'a pas
   * encore été remplacé par son porteur. La coquille du back-office l'oriente alors vers l'écran
   * de changement, et n'en laisse sortir qu'une fois le remplacement fait.
   */
  readonly doitChangerMotDePasse: boolean
  readonly roles: readonly Role[]
  readonly permissions: ReadonlySet<Permission>
  /**
   * Types de déclaration ouverts par ses RÔLES, lus dans `role_parcours`.
   *
   * Périmètre effectif : le rôle décide seul, l'attribution par personne n'entre plus dans le
   * calcul (décision métier du 2026-09-20).
   */
  readonly parcours: readonly ParcoursCode[]
  /**
   * L'un de ses rôles a-t-il la CHARGE des dossiers ?
   *
   * ⚠️ Donnée d'organisation, jamais déduite d'une permission. Le Service MGP porte
   * `dossiers.status.update` sans être traitant : le déduire le faisait apparaître titulaire de
   * TOUS les dossiers.
   */
  readonly traiteLesDossiers: boolean
  /** Ses porteurs sont-ils bornés à leur site ou à leur direction ? Paramètre du rôle. */
  readonly cloisonneParRattachement: boolean
  /** Ne voit que les déclarations qu'il a lui-même déposées, jamais les anonymes (RG-06). */
  readonly voitSeulementSesDeclarations: boolean
  /** Accès « sans données nominatives » : il voit les dossiers, jamais qui a déclaré. */
  readonly voitIdentiteDeclarant: boolean
  /**
   * Étapes de DÉPART qu'il peut franchir, par type de déclaration.
   *
   * ⚠️ Une ligne absente INTERDIT : ce qui n'est pas coché n'est pas permis.
   */
  readonly etapes: readonly { readonly parcours: string; readonly statut: string }[]
}

/*
  ⚠️ Aucune décision d'autorisation ne dépend d'un NOM de rôle. Les quatre qui le faisaient sont
  devenues des paramètres du rôle, lus ci-dessus : un rôle créé depuis l'interface ne figurait
  dans aucune liste écrite en dur, se comportait donc autrement, et rien ne le signalait.

  `u.roles` subsiste pour l'affichage, l'audit et l'administration — une donnée, pas une décision.
*/

/** N'exige que les permissions : voir `PourCloisonnement` pour la raison. */
export function aPermission(
  u: { readonly permissions: ReadonlySet<Permission> },
  permission: Permission
): boolean {
  return u.permissions.has(permission)
}

export function aUnePermissionParmi(
  u: { readonly permissions: ReadonlySet<Permission> },
  permissions: readonly Permission[]
): boolean {
  return permissions.some((permission) => u.permissions.has(permission))
}

/**
 * Charge rôles et permissions effectives d'un utilisateur.
 *
 * Permissions héritées des rôles, UNION celles accordées directement au compte
 * (`model_has_permissions`, vide aujourd'hui mais permise par le schéma).
 *
 * ⚠️ Une permission directe ne transite par aucun rôle : désactiver un rôle ne la retire pas.
 *
 * Retourne `null` si l'utilisateur n'existe pas.
 */
export async function chargerUtilisateurAutorise(userId: bigint): Promise<UtilisateurAutorise | null> {
  const utilisateur = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      actif: true,
      site_id: true,
      direction_id: true,
      doit_changer_mot_de_passe: true,
      // Le site de sa direction, quand il est rattaché à une direction plutôt qu'à un site.
      directions: { select: { site_id: true } },
    },
  })

  if (!utilisateur) {
    return null
  }

  const [liensRoles, permissionsDirectes, liensParcours] = await Promise.all([
    prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER, model_id: userId },
      select: {
        roles: {
          select: {
            name: true,
            actif: true,
            // Ce rôle a-t-il la CHARGE des dossiers ? Paramétré dans les habilitations, jamais
            // déduit d'une permission — voir `traiteLesDossiers`.
            traite_dossiers: true,
            // Les quatre comportements qui se lisaient dans des noms de rôles.
            cloisonne_par_rattachement: true,
            voit_seulement_ses_declarations: true,
            voit_identite_declarant: true,
            role_has_permissions: { select: { permissions: { select: { name: true } } } },
            role_etapes: {
              select: {
                parcours: { select: { code: true } },
                statuts_dossier: { select: { code: true } },
              },
            },
          },
        },
      },
    }),
    prisma.model_has_permissions.findMany({
      where: { model_type: MODEL_TYPE_USER, model_id: userId },
      select: { permissions: { select: { name: true } } },
    }),
    /*
      Parcours ouverts par ses rôles. Les deux filtres comptent : un type désactivé en base ne
      s'ouvre à personne, et un rôle éteint ne confère rien — sinon sa désactivation ne serait
      qu'à moitié effective.

      `utilisateur_parcours` n'est plus lue : l'attribution par personne ne décide plus rien.
    */
    prisma.role_parcours.findMany({
      where: {
        parcours: { actif: true },
        roles: {
          actif: true,
          model_has_roles: { some: { model_type: MODEL_TYPE_USER, model_id: userId } },
        },
      },
      select: { parcours: { select: { code: true } } },
    }),
  ])

  const roles: Role[] = []
  const permissions = new Set<Permission>()
  let traiteLesDossiers = false
  // ⚠️ Un rôle à la fois, la règle au bout : le compte n'est borné que si TOUS ses rôles porteurs
  // le prévoient. Un `||` accumulé ici masquerait ce qu'un second rôle donne le droit de voir.
  const cloisonnementParRole: { cloisonne: boolean; donneAcces: boolean }[] = []
  let voitSeulementSesDeclarations = false
  // Vrai par défaut : c'est le retrait qui se décide, rôle par rôle.
  let voitIdentiteDeclarant = true
  const etapes: { parcours: string; statut: string }[] = []

  for (const lien of liensRoles) {
    // Un rôle désactivé ne confère RIEN — ni permission, ni parcours — et disparaît de `roles`.
    // L'association est conservée en base : le réactiver rend leurs droits à ses porteurs.
    if (!lien.roles.actif) continue

    roles.push(lien.roles.name as Role)

    // Un SEUL rôle traitant suffit : porter en plus un rôle d'observation ne retire pas la charge.
    if (lien.roles.traite_dossiers) traiteLesDossiers = true

    cloisonnementParRole.push({
      cloisonne: lien.roles.cloisonne_par_rattachement,
      donneAcces: donneAccesAuxDossiers(
        lien.roles.role_has_permissions.map((rhp) => rhp.permissions.name)
      ),
    })

    if (lien.roles.voit_seulement_ses_declarations) voitSeulementSesDeclarations = true

    // L'accès sans données nominatives se RETIRE : un seul rôle qui le refuse suffit à le retirer.
    if (!lien.roles.voit_identite_declarant) voitIdentiteDeclarant = false

    for (const etape of lien.roles.role_etapes) {
      etapes.push({ parcours: etape.parcours.code, statut: etape.statuts_dossier.code })
    }

    for (const rhp of lien.roles.role_has_permissions) {
      permissions.add(rhp.permissions.name as Permission)
    }
  }

  for (const directe of permissionsDirectes) {
    permissions.add(directe.permissions.name as Permission)
  }

  return {
    id: utilisateur.id,
    actif: utilisateur.actif,
    // Site déduit de la direction quand le compte n'en porte pas : sans cela, un compte rattaché
    // à une direction n'aurait aucun site et cesserait d'être borné. Sert de filet depuis que
    // `directionId` borne directement.
    siteId: utilisateur.site_id ?? utilisateur.directions?.site_id ?? null,
    directionId: utilisateur.direction_id,
    doitChangerMotDePasse: utilisateur.doit_changer_mot_de_passe,
    roles,
    permissions,
    // Dédupliqué : deux rôles peuvent ouvrir le même type, et la requête rend alors deux lignes.
    parcours: [...new Set(liensParcours.map((lien) => lien.parcours.code as ParcoursCode))],
    traiteLesDossiers,
    cloisonneParRattachement: cloisonnePourSesRoles(cloisonnementParRole),
    voitSeulementSesDeclarations,
    voitIdentiteDeclarant,
    etapes,
  }
}
