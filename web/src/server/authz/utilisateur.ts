import { prisma } from '@/lib/prisma'
import type { ParcoursCode } from './parcours'
import { cloisonnePourSesRoles, donneAccesAuxDossiers } from './site'
import type { Permission } from './permissions'
import type { Role } from './roles'
import { MODELES } from '@/server/modeles'

/**
 * Le `model_type` des comptes, dans la table d'attribution des rôles.
 *
 * ⚠️ CE FUT UN LITTÉRAL PIÉGEUX jusqu'au 2026-09-22 : la valeur s'écrivait `App\Models\User`, et
 * en guillemets ordinaires `'App\Models\User'` vaut « AppModelsUser » — `\M` et `\U` ne sont pas
 * des séquences d'échappement valides, et JavaScript supprime silencieusement les antislashs.
 * Aucune erreur n'était levée : la comparaison échouait toujours, et le compte se retrouvait
 * sans aucun rôle. Il fallait donc `String.raw`, dans chacun des huit fichiers qui recopiaient
 * cette constante.
 *
 * Le code ne contient plus d'antislash : le piège a disparu avec lui, et la valeur vient
 * désormais d'un seul endroit.
 */
const MODEL_TYPE_USER = MODELES.utilisateur

/*
  ⚠️ `const GUARD = 'web'` A ÉTÉ RETIRÉ le 2026-09-22, avec la colonne `guard_name`.

  La « garde » séparait plusieurs systèmes d'authentification coexistants — sessions et jetons
  d'API, chacun avec son jeu de rôles. Cette application n'en a qu'un : les 18 rôles portaient
  tous `web`, et le code filtrait sur une valeur qu'il venait lui-même d'écrire.

  Un filtre qui n'exclut jamais rien n'est pas neutre : il se lit comme une protection. Un
  relecteur cherchant « les rôles sont-ils cloisonnés ? » trouvait une condition à chaque requête
  et concluait que oui.
*/

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
  /**
   * Direction de rattachement, `null` si le compte est habilité sur un site entier.
   *
   * ⚠️ PLUS FINE QUE LE SITE et prioritaire sur lui : « on peut être habilité sur un site,
   * c'est-à-dire plusieurs directions à la fois, ou sur une seule direction — dans ce cas on ne
   * reçoit que les déclarations de la direction ». Voir `directionCloisonnante()`.
   */
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
   * Types de déclaration ouverts par ses RÔLES — lus dans `role_parcours`, cochés dans
   * `/administration/habilitations`.
   *
   * ⚠️ C'est le périmètre EFFECTIF, et il n'est plus croisé avec quoi que ce soit. L'attribution
   * par personne (`utilisateur_parcours`) entrait autrefois dans le calcul ; le rôle décide seul
   * depuis le 2026-09-20.
   */
  readonly parcours: readonly ParcoursCode[]
  /**
   * L'un de ses rôles a-t-il la CHARGE des dossiers ?
   *
   * ⚠️ NE SE DÉDUIT D'AUCUNE PERMISSION, et c'est la correction du 2026-09-21. « Traiter » était
   * lu dans `dossiers.status.update` — « peut faire avancer un dossier ». Le Service MGP porte ce
   * droit sans être traitant : il apparaissait comme titulaire de TOUS les dossiers.
   *
   * C'est une donnée d'organisation, pas un droit. Elle se coche rôle par rôle dans l'écran des
   * habilitations, et se lit ici.
   */
  readonly traiteLesDossiers: boolean
  /**
   * Ses porteurs sont-ils bornés à leur site ou à leur direction ?
   *
   * ⚠️ PARAMÈTRE DU RÔLE depuis le 2026-09-21, plus une liste de noms écrite dans le code. Un rôle
   * créé depuis l'interface n'y figurait pas : il voyait tous les sites, et rien ne le disait.
   */
  readonly cloisonneParRattachement: boolean
  /** Ne voit que les déclarations qu'il a lui-même déposées, jamais les anonymes (RG-06). */
  readonly voitSeulementSesDeclarations: boolean
  /** Accès « sans données nominatives » : il voit les dossiers, jamais qui a déclaré. */
  readonly voitIdentiteDeclarant: boolean
  /**
   * Étapes de DÉPART qu'il peut franchir, par type de déclaration.
   *
   * ⚠️ UNE LIGNE ABSENTE INTERDIT. Dans le code, une étape absente de la table des acteurs
   * signifiait « ouverte à tous » ; la reprise a rendu ces cas explicites, et la règle est
   * désormais unique : ce qui n'est pas coché n'est pas permis.
   */
  readonly etapes: readonly { readonly parcours: string; readonly statut: string }[]
}

/*
  ⚠️ `aRole()` ET `aUnRoleParmi()` ONT ÉTÉ SUPPRIMÉES le 2026-09-21.

  Elles étaient le dernier moyen, pour une décision d'autorisation, de dépendre d'un NOM de rôle.
  Quatre le faisaient encore — le cloisonnement par site, « ne voit que ses déclarations »,
  « ne voit pas l'identité du déclarant », et la liste des étapes —, et toutes les quatre
  partageaient le même défaut : un rôle créé depuis l'interface n'y figurait pas, se comportait
  donc autrement que celui qu'il remplaçait, et rien ne le signalait.

  Les quatre sont devenues des paramètres du rôle, cochés dans les habilitations et lus ci-dessus.
  Supprimer les deux fonctions n'est pas du rangement : c'est ce qui empêche la règle de revenir
  par une cinquième porte, sans que personne ne s'en aperçoive avant le prochain rôle créé.

  `u.roles` subsiste — pour l'affichage, le journal d'audit et les écrans d'administration. C'est
  une donnée, plus une décision.
*/

/**
 * ⚠️ N'EXIGE QUE LES PERMISSIONS, pas un `UtilisateurAutorise` complet.
 *
 * Deux services construisent une photographie d'autorisation partielle pour poser une question de
 * cloisonnement (voir `PourCloisonnement`). Exiger le type entier les obligeait à inventer une
 * valeur pour chaque champ hors sujet, et une valeur inventée se lit comme une vérité partout où
 * l'objet circule ensuite.
 */
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
 * Deux sources s'additionnent : les permissions héritées des rôles, UNION celles accordées
 * directement au compte (`model_has_permissions`). Cette seconde table est vide aujourd'hui, mais
 * le schéma l'autorise — l'ignorer produirait un compte privé d'un droit qu'on lui a bel et bien
 * accordé, le jour où quelqu'un s'en servira.
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
      Les parcours ouverts par ses RÔLES. Relus ici à chaque requête, comme les rôles et les
      permissions : une case décochée dans les habilitations coupe l'accès tout de suite, sans
      attendre une reconnexion.

      ⚠️ TROIS FILTRES, ET LES TROIS COMPTENT :

        - `parcours.actif` : un type de déclaration désactivé en base ne s'ouvre à personne, quelles
          que soient les cases cochées.
        - `roles.actif` : un rôle éteint ne confère rien — même règle que pour ses permissions, et
          la contourner ici rendrait la désactivation d'un rôle à moitié effective.

      ⚠️ `utilisateur_parcours` N'EST PLUS LUE. L'attribution par personne ne décide plus rien
      (décision métier du 2026-09-20) ; la table subsiste, elle porte l'ancien paramétrage.
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
  /*
    ⚠️ UN RÔLE À LA FOIS, puis la règle au bout — et non un drapeau levé au premier rôle cloisonné.

    « Cumuler n'est pas être deux fois restreint, c'est porter un mandat plus large » : le compte
    n'est borné que si TOUS ses rôles porteurs d'accès le prévoient. Un `||` accumulé ici aurait
    retiré à un compte cumulant deux rôles ce que le second lui donnait le droit de voir, sans
    erreur et sans message. Voir `cloisonnePourSesRoles()`.
  */
  const cloisonnementParRole: { cloisonne: boolean; donneAcces: boolean }[] = []
  let voitSeulementSesDeclarations = false
  // Vrai par défaut : c'est le retrait qui se décide, rôle par rôle.
  let voitIdentiteDeclarant = true
  const etapes: { parcours: string; statut: string }[] = []

  for (const lien of liensRoles) {
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
    /*
      ⚠️ LE SITE EST DÉDUIT de la direction quand le compte n'en porte pas directement.

      Un compte se rattache à un site OU à une direction, jamais aux deux. Sans cette déduction,
      celui qui choisit une direction n'aurait AUCUN site — et `siteCloisonnant()`, qui rend
      `null` dans ce cas, cesserait de le borner : il verrait les dossiers de tous les sites. Un
      cloisonnement qui s'efface parce qu'on a renseigné un rattachement PLUS précis serait
      l'inverse de ce qu'on attend.

      Une direction appartient toujours à un site (`directions.site_id`), et c'est par elle que
      les dossiers trouvent le leur : la déduction ne fabrique rien, elle suit le même chemin.

      ⚠️ CE SITE DÉDUIT NE SERT PLUS QUE DE FILET. Depuis que `directionId` est porté, un compte
      rattaché à une direction est borné PAR SA DIRECTION, et `siteCloisonnant()` s'efface devant
      elle. La déduction reste parce qu'elle décrit une vérité — la direction appartient bien à ce
      site — et qu'elle continue de borner les rares comptes dont la direction serait retirée sans
      que le site le soit.
    */
    siteId: utilisateur.site_id ?? utilisateur.directions?.site_id ?? null,
    directionId: utilisateur.direction_id,
    doitChangerMotDePasse: utilisateur.doit_changer_mot_de_passe,
    roles,
    permissions,
    /*
      ⚠️ DÉDUPLIQUÉ. Deux rôles peuvent ouvrir le même type de déclaration — un correspondant qui
      est aussi responsable de structure —, et la requête rend alors deux lignes. Sans ce `Set`,
      l'écran des comptes afficherait « Grief employé · Grief employé ».
    */
    parcours: [...new Set(liensParcours.map((lien) => lien.parcours.code as ParcoursCode))],
    traiteLesDossiers,
    cloisonneParRattachement: cloisonnePourSesRoles(cloisonnementParRole),
    voitSeulementSesDeclarations,
    voitIdentiteDeclarant,
    etapes,
  }
}
