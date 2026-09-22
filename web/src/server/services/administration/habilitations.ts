import { prisma } from '@/lib/prisma'
import {
  LIBELLES_ROLE,
  PERMISSIONS,
  PARCOURS_CODES,
  ROLES,
  ROLE_NAMES,
  donneAccesAuxDossiers,
  type ParcoursCode,
  type Permission,
  type RoleLivre,
} from '@/server/authz'
import { STATUTS, transitionsDepuis, type StatutCode } from '../dossier/statuts'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser } from '../audit/journal'

/** Garde Spatie : les lignes d'un autre garde ne concernent pas cette application. */
const GUARD = 'web'

/**
 * Quels types de déclaration chaque rôle ouvre — lu dans `role_parcours`.
 *
 * ⚠️ REMPLACE `parcoursDuRole()`, qui lisait une table écrite dans le code. Cette table est
 * désormais cochée dans l'écran des habilitations : la fonction qui la décrivait ne pouvait plus
 * rester synchrone, puisqu'il faut interroger la base.
 *
 * Le libellé accompagne le code : un écran qui affiche « grief_sous_traitant » n'apprend rien à
 * qui n'a pas écrit l'application.
 */
export async function parcoursParRole(): Promise<
  Map<string, { code: ParcoursCode; libelle: string; alerteCircuitCritique: boolean }[]>
> {
  const lignes = await prisma.role_parcours.findMany({
    where: { roles: { guard_name: GUARD } },
    select: {
      alerte_circuit_critique: true,
      roles: { select: { name: true } },
      parcours: { select: { code: true, libelle: true, ordre: true } },
    },
  })

  const par = new Map<
    string,
    { code: ParcoursCode; libelle: string; ordre: number; alerteCircuitCritique: boolean }[]
  >()

  for (const ligne of lignes) {
    const deja = par.get(ligne.roles.name) ?? []
    deja.push({
      code: ligne.parcours.code as ParcoursCode,
      libelle: ligne.parcours.libelle,
      ordre: ligne.parcours.ordre,
      alerteCircuitCritique: ligne.alerte_circuit_critique,
    })
    par.set(ligne.roles.name, deja)
  }

  // L'ordre du référentiel, pas celui de la base : les quatre types se lisent toujours dans le
  // même sens d'un écran à l'autre.
  return new Map(
    [...par].map(([role, liste]) => [
      role,
      liste
        .sort((a, b) => a.ordre - b.ordre)
        .map(({ code, libelle, alerteCircuitCritique }) => ({
          code,
          libelle,
          alerteCircuitCritique,
        })),
    ])
  )
}

/**
 * Les rôles dont les porteurs sont bornés à leur site ou à leur direction.
 *
 * ⚠️ LA LISTE A QUITTÉ LE CODE le 2026-09-21 : elle y était écrite nom par nom, si bien qu'un rôle
 * créé depuis l'interface n'y figurait jamais et voyait tous les sites sans que rien ne le dise.
 * La console des comptes s'appuyait dessus pour signaler « rattachement manquant » ; elle lit
 * désormais la même colonne que l'autorisation elle-même.
 */
export async function cloisonnementParRole(): Promise<
  Map<string, { cloisonne: boolean; donneAcces: boolean }>
> {
  const lignes = await prisma.roles.findMany({
    where: { guard_name: GUARD },
    select: {
      name: true,
      cloisonne_par_rattachement: true,
      role_has_permissions: { select: { permissions: { select: { name: true } } } },
    },
  })

  return new Map(
    lignes.map((l) => [
      l.name,
      {
        cloisonne: l.cloisonne_par_rattachement,
        donneAcces: donneAccesAuxDossiers(l.role_has_permissions.map((r) => r.permissions.name)),
      },
    ])
  )
}

/** Les quatre types, dans l'ordre du référentiel — pour construire les cases à cocher. */
export async function parcoursACocher(): Promise<{ code: ParcoursCode; libelle: string }[]> {
  const lignes = await prisma.parcours.findMany({
    where: { actif: true },
    orderBy: { ordre: 'asc' },
    select: { code: true, libelle: true },
  })

  return lignes
    .filter((p) => (PARCOURS_CODES as readonly string[]).includes(p.code))
    .map((p) => ({ code: p.code as ParcoursCode, libelle: p.libelle }))
}

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
  readonly role: string
  /** Nom lisible, administrable. Le `role` technique, lui, ne change jamais. */
  readonly libelle: string
  readonly description: string | null
  /** Un rôle désactivé ne confère plus rien — voir `chargerUtilisateurAutorise()`. */
  readonly actif: boolean
  /** Ce qui S'APPLIQUE : lu en base, pas dans le code. */
  readonly permissions: readonly Permission[]
  /** Ce qui a été LIVRÉ : la configuration de référence, pour situer les ajustements. */
  readonly reference: readonly Permission[]
  /** Comptes actifs portant ce rôle — un rôle que personne ne porte mérite d'être questionné. */
  readonly comptes: number
  /**
   * Rôle du CDC, décrit par le code — par opposition à un rôle créé depuis l'interface.
   *
   * Les policies s'y réfèrent par leur nom : le cloisonnement par parcours, la table des acteurs
   * d'étape, l'habilitation par site. Un rôle livré ne peut donc pas être supprimé, seulement
   * désactivé. Un rôle créé ici, que le code ne connaît pas, le peut.
   */
  readonly livre: boolean
  /**
   * Nombre de comptes RATTACHÉS, actifs ou non.
   *
   * Distinct de `comptes` : celui-ci sert à décider si le rôle peut être supprimé sans retirer
   * son accès à quelqu'un, et un compte désactivé aujourd'hui peut être réactivé demain.
   */
  readonly rattachements: number
  /**
   * Types de déclaration que ce rôle ouvre. Vide = ce rôle ne donne accès à AUCUN dossier.
   *
   * ⚠️ ADMINISTRABLE depuis le 2026-09-20 : ces cases se cochent dans cet écran même, et la règle
   * n'est plus écrite dans le code. Un rôle créé depuis l'interface peut donc recevoir un
   * périmètre sans déploiement — ce qui n'était pas possible avant, ses permissions s'appliquant
   * alors sans porter sur aucun dossier.
   */
  readonly parcours: readonly {
    readonly code: ParcoursCode
    readonly libelle: string
    /** RG-08 : alerté immédiatement quand une déclaration de CE type est qualifiée critique. */
    readonly alerteCircuitCritique: boolean
  }[]
  /**
   * Les quatre comportements du rôle, tels qu'ils se cochent.
   *
   * ⚠️ TOUS LES QUATRE SE LISAIENT DANS DES NOMS DE RÔLES jusqu'au 2026-09-21. Un rôle créé depuis
   * l'interface ne figurait dans aucune de ces listes : il n'était borné par aucun rattachement,
   * voyait l'identité des déclarants, et rien ne le disait à qui venait de le créer.
   */
  readonly comportements: Readonly<Record<ComportementRole, boolean>>
  /**
   * La grille « qui fait avancer quoi » : une case par type de déclaration et par étape.
   *
   * ⚠️ UNE CASE VIDE INTERDIT. Ce qui n'est pas coché n'est pas permis — voir `authz/etapes.ts`.
   */
  readonly etapes: readonly { readonly parcours: string; readonly statut: string }[]
}

/**
 * Les quatre comportements d'un rôle qui ne sont ni une permission, ni un type, ni une étape.
 *
 * ⚠️ CE CATALOGUE EST FERMÉ, ET C'EST LA DIFFÉRENCE AVEC LES RÔLES. Un comportement est un endroit
 * du code qui LIT la colonne : en ajouter un demande d'écrire ce code, donc un déploiement. Ce qui
 * est libre, c'est de décider quel rôle le porte — et c'est précisément ce qui manquait.
 *
 * Le libellé et l'aide vivent ici plutôt que dans l'écran : trois écrans les affichent déjà, et
 * une formulation recopiée finit par décrire autre chose que ce que le code applique.
 */
export const COMPORTEMENTS_ROLE = {
  traite_dossiers: {
    libelle: 'A la charge des dossiers de son périmètre',
    aide: "Ses porteurs apparaissent comme titulaires sur chaque fiche de leur périmètre, et ces dossiers entrent dans leur « à traiter ». Distinct du droit de faire avancer un dossier : le Service MGP arbitre sans instruire.",
  },
  cloisonne_par_rattachement: {
    libelle: 'Borné à son site ou à sa direction',
    aide: "Ses porteurs ne voient que les déclarations de leur rattachement. Un compte habilité sur une seule direction ne reçoit que celles de cette direction ; un compte habilité sur un site reçoit celles de toutes ses directions.",
  },
  voit_seulement_ses_declarations: {
    libelle: 'Ne voit que ses propres déclarations',
    aide: "Réservé aux rôles de déclarant. Ses porteurs ne voient que ce qu'ils ont eux-mêmes déposé, et jamais une déclaration anonyme — qui n'est rattachée à aucun compte.",
  },
  voit_identite_declarant: {
    libelle: "Voit l'identité du déclarant",
    aide: "Décoché, c'est un accès « sans données nominatives » : ses porteurs lisent les dossiers mais jamais qui a déclaré, ni son poste. Coché par défaut.",
  },
} as const satisfies Record<string, { libelle: string; aide: string }>

export type ComportementRole = keyof typeof COMPORTEMENTS_ROLE

export const COMPORTEMENTS_NOMS = Object.keys(COMPORTEMENTS_ROLE) as ComportementRole[]

/** Les étapes de DÉPART qui se cochent : celles d'où un dossier peut effectivement partir. */
export type EtapeACocher = {
  readonly code: StatutCode
  readonly libelle: string
}

/**
 * Les étapes proposées à la grille.
 *
 * ⚠️ SEULEMENT CELLES D'OÙ L'ON PEUT PARTIR. « Résolu » et « Clos » n'ont aucune transition
 * sortante : y désigner un acteur ne débloquerait rien, et les afficher donnerait à croire que
 * huit cases sont restées vides par oubli.
 *
 * Le libellé vient de la base — c'est celui que porte le dossier à l'écran. Un code technique dans
 * une grille de seize cases se lit mal, et se coche mal.
 */
export async function etapesACocher(): Promise<EtapeACocher[]> {
  const lignes = await prisma.statuts_dossier.findMany({
    orderBy: { ordre: 'asc' },
    select: { code: true, libelle_interne: true },
  })

  return lignes
    .filter(
      (l) =>
        (STATUTS as readonly string[]).includes(l.code) &&
        transitionsDepuis(l.code as StatutCode).length > 0
    )
    .map((l) => ({ code: l.code as StatutCode, libelle: l.libelle_interne }))
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
  /** Les types de déclaration proposés à la coche — ceux qui sont actifs en base. */
  readonly parcoursDisponibles: readonly { readonly code: ParcoursCode; readonly libelle: string }[]
  /** Les colonnes de la grille des étapes : celles d'où un dossier peut partir. */
  readonly etapesDisponibles: readonly EtapeACocher[]
  readonly ecarts: EcartHabilitation[]
}

const MODEL_TYPE_USER = String.raw`App\Models\User`

export async function chargerHabilitations(): Promise<Habilitations> {
  const [
    rolesEnBase,
    associations,
    comptesActifs,
    parcoursDesRoles,
    tousLesParcours,
    toutesLesEtapes,
  ] = await Promise.all([
    prisma.roles.findMany({
      // Les rôles d'un autre garde ne concernent pas cette application : les lister ici les
      // aurait présentés comme administrables, et comparés à une référence qui ne les vise pas.
      where: { guard_name: GUARD },
      select: {
        name: true,
        libelle: true,
        description: true,
        actif: true,
        // Les quatre comportements qui se lisaient dans des noms de rôles — voir
        // `COMPORTEMENTS_ROLE`. Un rôle absent de la base n'en porte aucun : il ne confère rien.
        traite_dossiers: true,
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
    }),
    prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER },
      select: { model_id: true, roles: { select: { name: true } } },
    }),
    prisma.users.findMany({ where: { actif: true }, select: { id: true } }),
    parcoursParRole(),
    parcoursACocher(),
    etapesACocher(),
  ])

  // `model_has_roles` est la table polymorphe de Spatie : elle n'a pas de relation vers `users`,
  // seulement un `model_type` et un `model_id`. L'intersection se fait donc ici.
  const actifs = new Set(comptesActifs.map((u) => u.id))
  const effectifs = new Map<string, number>()
  const rattachements = new Map<string, number>()

  for (const association of associations) {
    const nom = association.roles.name
    rattachements.set(nom, (rattachements.get(nom) ?? 0) + 1)

    if (!actifs.has(association.model_id)) continue
    effectifs.set(nom, (effectifs.get(nom) ?? 0) + 1)
  }

  const enBaseParRole = new Map(rolesEnBase.map((r) => [r.name, r]))

  /*
    La liste part de l'UNION du code et de la base, et non plus du seul code.

    Elle était construite à partir de `ROLE_NAMES` : un rôle créé depuis l'interface existait bien
    en base, s'appliquait bien aux comptes qui le portaient — et n'apparaissait nulle part. On
    l'aurait cherché longtemps.
  */
  const noms = rolesEnBase.map((r) => r.name)

  const lignes = noms.map((role) => {
    const enBase = enBaseParRole.get(role)
    const livre = (ROLE_NAMES as readonly string[]).includes(role)

    return {
      role,
      // Un rôle décidé par le code mais absent de la base n'a ni libellé ni activation : il est
      // présenté comme inactif, ce qu'il est de fait — il ne confère rien.
      libelle: enBase?.libelle ?? LIBELLES_ROLE[role] ?? role,
      description: enBase?.description ?? null,
      actif: enBase?.actif ?? false,
      permissions:
        enBase?.role_has_permissions.map((rhp) => rhp.permissions.name as Permission).sort() ?? [],
      reference: livre ? ROLES[role as RoleLivre] : [],
      comptes: effectifs.get(role) ?? 0,
      livre,
      rattachements: rattachements.get(role) ?? 0,
      parcours: parcoursDesRoles.get(role) ?? [],
      /*
        Faux pour un rôle décrit par le code mais absent de la base : il ne confère rien, donc il
        ne traite rien non plus.

        ⚠️ `voit_identite_declarant` EST VRAI PAR DÉFAUT, contrairement aux trois autres. C'est un
        RETRAIT qui se coche — un accès « sans données nominatives » —, et un rôle qu'on oublie de
        paramétrer doit voir ce que voient les autres, pas moins.
      */
      comportements: {
        traite_dossiers: enBase?.traite_dossiers ?? false,
        cloisonne_par_rattachement: enBase?.cloisonne_par_rattachement ?? false,
        voit_seulement_ses_declarations: enBase?.voit_seulement_ses_declarations ?? false,
        voit_identite_declarant: enBase?.voit_identite_declarant ?? true,
      },
      etapes: (enBase?.role_etapes ?? []).map((e) => ({
        parcours: e.parcours.code,
        statut: e.statuts_dossier.code,
      })),
    }
  })

  return {
    lignes,
    permissions: PERMISSIONS,
    parcoursDisponibles: tousLesParcours,
    etapesDisponibles: toutesLesEtapes,
    ecarts: comparer(rolesEnBase),
  }
}

/**
 * Compare la configuration de référence (le code) à ce qui s'applique (la base).
 *
 * Le sens de l'écart compte : une permission retirée prive d'un accès prévu à la livraison, une
 * permission ajoutée en accorde un qui ne l'était pas. Aucun des deux n'est fautif en soi — mais
 * les deux méritent d'être vus, et le journal d'audit dit qui les a décidés.
 */
function comparer(
  rolesEnBase: readonly {
    name: string
    role_has_permissions: { permissions: { name: string } }[]
  }[]
): EcartHabilitation[] {
  const ecarts: EcartHabilitation[] = []

  for (const role of rolesEnBase) {
    // Un rôle créé depuis l'interface n'a pas de référence livrée : il ne peut pas s'en écarter.
    // Sans cette sortie, toutes ses permissions se seraient affichées comme « ajoutées ».
    if (!(ROLE_NAMES as readonly string[]).includes(role.name)) continue

    const enBase = new Set(role.role_has_permissions.map((r) => r.permissions.name))
    const attendues = new Set<string>(ROLES[role.name as RoleLivre] ?? [])

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
  const inconnues = permissionsVoulues.filter((p) => !PERMISSIONS.includes(p as Permission))

  if (inconnues.length > 0) {
    throw new ErreurWorkflow(`Permission inconnue : ${inconnues.join(', ')}.`)
  }

  const ligneRole = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: { id: true, role_has_permissions: { select: { permissions: { select: { id: true, name: true } } } } },
  })

  if (!ligneRole) throw new ErreurWorkflow('Rôle inconnu.')

  const actuelles = new Map(
    ligneRole.role_has_permissions.map((r) => [r.permissions.name, r.permissions.id])
  )
  const voulues = new Set(permissionsVoulues)

  const aRetirer = [...actuelles.entries()].filter(([nom]) => !voulues.has(nom))
  const aAjouter = [...voulues].filter((nom) => !actuelles.has(nom))

  if (aRetirer.length === 0 && aAjouter.length === 0) return

  await verifierQuUnAdministrateurSubsiste({ role, permissions: voulues })

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
 * Quels types de déclaration ce rôle ouvre.
 *
 * ⚠️ CE GESTE CHANGE CE QUE DES GENS VOIENT, immédiatement et pour tous les porteurs du rôle :
 * `chargerUtilisateurAutorise()` relit `role_parcours` à chaque requête. Décocher un type le
 * retire de la vue de chacun d'eux sans attendre une reconnexion — c'est l'effet voulu, et c'est
 * pourquoi le geste est journalisé comme les permissions.
 *
 * L'absence vaut retrait : la liste reçue décrit l'état complet du rôle, pas un ajout.
 */
export async function modifierParcoursRole(
  acteur: { id: bigint },
  role: string,
  parcoursVoulus: readonly string[],
  /*
    ⚠️ LES TYPES ALERTÉS EN CIRCUIT ACCÉLÉRÉ, cochés dans la MÊME grille et enregistrés dans le
    même geste — parce qu'ils vivent sur la même ligne (`role_parcours.alerte_circuit_critique`).

    Deux formulaires séparés auraient laissé une fenêtre où le type est décoché mais son alerte
    encore cochée : la ligne disparaît, l'alerte avec elle, sans que l'écran l'ait annoncé. Ici,
    l'alerte d'un type non coché est simplement ignorée — cocher l'un sans l'autre n'a pas de
    sens, et refuser l'enregistrement pour cela ne rendrait service à personne.
  */
  circuitVoulu: readonly string[] = []
): Promise<void> {
  const inconnus = parcoursVoulus.filter(
    (p) => !(PARCOURS_CODES as readonly string[]).includes(p)
  )

  if (inconnus.length > 0) {
    throw new ErreurWorkflow(`Type de déclaration inconnu : ${inconnus.join(', ')}.`)
  }

  const ligneRole = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: {
      id: true,
      role_parcours: {
        select: {
          alerte_circuit_critique: true,
          parcours: { select: { id: true, code: true } },
        },
      },
    },
  })

  if (!ligneRole) throw new ErreurWorkflow('Rôle inconnu.')

  const actuels = new Map(ligneRole.role_parcours.map((rp) => [rp.parcours.code, rp.parcours.id]))
  const voulus = new Set(parcoursVoulus)

  // Un type non coché ne peut pas être alerté : sa ligne n'existera pas.
  const alertes = new Set([...circuitVoulu].filter((code) => voulus.has(code)))

  const aRetirer = [...actuels.entries()].filter(([code]) => !voulus.has(code))
  const aAjouter = [...voulus].filter((code) => !actuels.has(code))

  const circuitActuel = new Set(
    ligneRole.role_parcours
      .filter((rp) => rp.alerte_circuit_critique)
      .map((rp) => rp.parcours.code)
  )

  const circuitChange =
    alertes.size !== circuitActuel.size || [...alertes].some((code) => !circuitActuel.has(code))

  if (aRetirer.length === 0 && aAjouter.length === 0 && !circuitChange) return

  if (aRetirer.length > 0) {
    await prisma.role_parcours.deleteMany({
      where: { role_id: ligneRole.id, parcours_id: { in: aRetirer.map(([, id]) => id) } },
    })
  }

  if (aAjouter.length > 0) {
    const lignes = await prisma.parcours.findMany({
      where: { code: { in: aAjouter } },
      select: { id: true, code: true },
    })

    const maintenant = new Date()

    await prisma.role_parcours.createMany({
      data: lignes.map((p) => ({
        role_id: ligneRole.id,
        parcours_id: p.id,
        alerte_circuit_critique: alertes.has(p.code),
        created_at: maintenant,
        updated_at: maintenant,
      })),
    })
  }

  /*
    Les lignes qui SUBSISTENT et dont l'alerte change.

    Séparé des créations ci-dessus, qui posent déjà la bonne valeur : les mêmes lignes seraient
    sinon écrites deux fois, et la seconde écriture masquerait une erreur de la première.
  */
  if (circuitChange) {
    const subsistantes = [...actuels.entries()].filter(([code]) => voulus.has(code))

    for (const [code, id] of subsistantes) {
      const voulue = alertes.has(code)
      if (circuitActuel.has(code) === voulue) continue

      await prisma.role_parcours.updateMany({
        where: { role_id: ligneRole.id, parcours_id: id },
        data: { alerte_circuit_critique: voulue, updated_at: new Date() },
      })
    }
  }

  await journaliser({
    action: 'role.parcours_modifies',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligneRole.id),
    anciennes: { role, parcours: [...actuels.keys()].sort(), circuitCritique: [...circuitActuel].sort() },
    nouvelles: { role, parcours: [...voulus].sort(), circuitCritique: [...alertes].sort() },
  })
}

/**
 * Modifie l'identité lisible d'un rôle : son libellé et sa description.
 *
 * ⚠️ `name` — l'identifiant technique — n'est PAS modifiable, et cette fonction ne l'expose pas.
 * Il est référencé par `model_has_roles`, par le catalogue `authz/roles.ts`, par la table des
 * acteurs d'étape et par `role_parcours` : le renommer romprait le périmètre **sans aucune
 * erreur**, un rôle dont plus aucune ligne ne porte le nom n'ouvrant simplement plus rien. Ce
 * qu'on renomme ici, c'est ce que les gens lisent ; ce que le code utilise ne bouge pas.
 */
export async function modifierIdentiteRole(
  acteur: { id: bigint },
  role: string,
  identite: { libelle: string; description: string | null }
): Promise<void> {
  const libelle = identite.libelle.trim()
  const description = identite.description?.trim() || null

  if (libelle.length < 3) {
    throw new ErreurWorkflow('Le libellé doit compter au moins 3 caractères.')
  }

  if (libelle.length > 255) {
    throw new ErreurWorkflow('Le libellé ne peut pas dépasser 255 caractères.')
  }

  if (description !== null && description.length > 1000) {
    throw new ErreurWorkflow('La description ne peut pas dépasser 1000 caractères.')
  }

  const ligne = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: { id: true, libelle: true, description: true },
  })

  if (!ligne) throw new ErreurWorkflow('Rôle inconnu.')

  if (ligne.libelle === libelle && ligne.description === description) return

  await prisma.roles.update({
    where: { id: ligne.id },
    data: { libelle, description, updated_at: new Date() },
  })

  await journaliser({
    action: 'role.identite_modifiee',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligne.id),
    anciennes: { role, libelle: ligne.libelle, description: ligne.description },
    nouvelles: { role, libelle, description },
  })
}

/**
 * Active ou désactive un rôle.
 *
 * La désactivation est la seule forme de retrait prévue : un rôle ne se supprime pas (RG-03), car
 * il reste cité dans le journal d'audit et dans l'historique des comptes. Ce qu'elle fait vraiment
 * se joue dans `chargerUtilisateurAutorise()` — un rôle inactif ne confère plus ni permission ni
 * parcours, dès la requête suivante et pour tous ceux qui le portent.
 *
 * Les associations `model_has_roles` sont CONSERVÉES : la réactivation rend leurs droits aux
 * comptes concernés sans qu'il faille les réattribuer un par un. C'est la différence entre
 * suspendre un rôle et le vider.
 */
/**
 * Un des quatre comportements du rôle — voir `COMPORTEMENTS_ROLE`.
 *
 * ⚠️ CE GESTE CHANGE CE QUE DES GENS VOIENT, immédiatement et pour tous les porteurs du rôle :
 * `chargerUtilisateurAutorise()` relit ces colonnes à chaque requête. Cocher « borné à son site »
 * retire de leur vue tous les dossiers des autres sites sans attendre une reconnexion — c'est
 * l'effet voulu, et c'est pourquoi le geste est journalisé comme les permissions.
 *
 * ⚠️ « A LA CHARGE » EST DISTINCT DE `dossiers.status.update`. Ce droit dit qu'on peut faire
 * AVANCER un dossier ; ce paramètre dit qu'on en RÉPOND. Le Service MGP arbitre et relance sans
 * instruire : il porte le droit, pas la charge. Avoir déduit l'un de l'autre l'a fait apparaître
 * comme titulaire de tous les dossiers — c'est le défaut que ce paramètre corrige.
 */
export async function changerComportementRole(
  acteur: { id: bigint },
  role: string,
  comportement: ComportementRole,
  valeur: boolean
): Promise<void> {
  /*
    ⚠️ LE NOM DE COLONNE EST VALIDÉ CONTRE LE CATALOGUE, jamais repris tel quel.

    Il arrive d'un formulaire, et il sert de clé dans un `data:` Prisma. Sans cette garde, un
    champ forgé désignerait n'importe quelle colonne de `roles` — `actif`, par exemple, dont la
    modification a son propre contrôle et son propre journal.
  */
  if (!(COMPORTEMENTS_NOMS as readonly string[]).includes(comportement)) {
    throw new ErreurWorkflow('Comportement inconnu.')
  }

  const ligne = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: {
      id: true,
      traite_dossiers: true,
      cloisonne_par_rattachement: true,
      voit_seulement_ses_declarations: true,
      voit_identite_declarant: true,
    },
  })

  if (!ligne) throw new ErreurWorkflow('Rôle inconnu.')

  const avant = ligne[comportement]

  if (avant === valeur) return

  await prisma.roles.update({
    where: { id: ligne.id },
    data: { [comportement]: valeur, updated_at: new Date() },
  })

  await journaliser({
    /*
      ⚠️ CODE GÉNÉRIQUE À DESSEIN, pour l'instant.

      `role.comportement_modifie` serait plus parlant, mais le journal traduit les codes depuis
      une table qui vit dans `audit/libelles.ts` — un fichier en cours de modification ailleurs,
      que je ne dois pas toucher sous peine d'écraser du travail. Un code sans libellé
      s'afficherait en clair technique dans le journal.

      `role.modifie` est déjà traduit, et les valeurs ci-dessous disent exactement ce qui a
      changé. À renommer quand le fichier des libellés sera libre.
    */
    action: 'role.modifie',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligne.id),
    anciennes: { role, [comportement]: avant },
    nouvelles: { role, [comportement]: valeur },
  })
}

/**
 * La grille « qui fait avancer quoi » : quelles étapes ce rôle peut franchir, et sur quels types.
 *
 * ⚠️ CE GESTE PEUT BLOQUER UN CIRCUIT, et c'est le plus silencieux des réglages. Décocher la
 * dernière case d'une colonne n'affiche aucune erreur : le dossier arrive à cette étape et n'en
 * repart jamais, sans message, sans trace, sans que personne sache à qui s'adresser.
 * `santeAdministration()` remonte ces colonnes vides au tableau de bord d'administration — c'est
 * le seul endroit où on les verra.
 *
 * L'absence vaut retrait : la liste reçue décrit l'état complet du rôle, pas un ajout.
 */
export async function modifierEtapesRole(
  acteur: { id: bigint },
  role: string,
  casesVoulues: readonly { readonly parcours: string; readonly statut: string }[]
): Promise<void> {
  const ligneRole = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: {
      id: true,
      role_etapes: {
        select: {
          id: true,
          parcours: { select: { code: true } },
          statuts_dossier: { select: { code: true } },
        },
      },
    },
  })

  if (!ligneRole) throw new ErreurWorkflow('Rôle inconnu.')

  const [parcoursEnBase, statutsEnBase] = await Promise.all([
    prisma.parcours.findMany({ select: { id: true, code: true } }),
    prisma.statuts_dossier.findMany({ select: { id: true, code: true } }),
  ])

  const idParcours = new Map(parcoursEnBase.map((p) => [p.code, p.id]))
  const idStatut = new Map(statutsEnBase.map((s) => [s.code, s.id]))

  /*
    ⚠️ VALIDÉ CASE PAR CASE, contre la base ET contre le graphe des transitions.

    Un couple inconnu passerait sinon en base sans rien faire — la fonction qui le lit ne le
    trouverait jamais —, et un couple portant une étape terminale y resterait visible sans
    autoriser quoi que ce soit : le graphe n'en laisse partir aucun dossier.
  */
  const cle = (c: { parcours: string; statut: string }) => `${c.parcours}/${c.statut}`
  const voulues = new Map<string, { parcours: string; statut: string }>()

  for (const cas of casesVoulues) {
    if (!idParcours.has(cas.parcours) || !idStatut.has(cas.statut)) {
      throw new ErreurWorkflow(`Étape inconnue : ${cle(cas)}.`)
    }

    if (
      !(STATUTS as readonly string[]).includes(cas.statut) ||
      transitionsDepuis(cas.statut as StatutCode).length === 0
    ) {
      throw new ErreurWorkflow(`Aucun dossier ne part de l’étape « ${cas.statut} ».`)
    }

    voulues.set(cle(cas), { parcours: cas.parcours, statut: cas.statut })
  }

  const actuelles = new Map(
    ligneRole.role_etapes.map((e) => [
      `${e.parcours.code}/${e.statuts_dossier.code}`,
      { id: e.id, parcours: e.parcours.code, statut: e.statuts_dossier.code },
    ])
  )

  const aRetirer = [...actuelles.values()].filter((e) => !voulues.has(cle(e)))
  const aAjouter = [...voulues.values()].filter((e) => !actuelles.has(cle(e)))

  if (aRetirer.length === 0 && aAjouter.length === 0) return

  if (aRetirer.length > 0) {
    await prisma.role_etapes.deleteMany({ where: { id: { in: aRetirer.map((e) => e.id) } } })
  }

  if (aAjouter.length > 0) {
    const maintenant = new Date()

    await prisma.role_etapes.createMany({
      data: aAjouter.map((e) => ({
        role_id: ligneRole.id,
        parcours_id: idParcours.get(e.parcours) as bigint,
        statut_id: idStatut.get(e.statut) as bigint,
        created_at: maintenant,
        updated_at: maintenant,
      })),
      skipDuplicates: true,
    })
  }

  await journaliser({
    action: 'role.modifie',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligneRole.id),
    anciennes: { role, etapes: [...actuelles.keys()].sort() },
    nouvelles: { role, etapes: [...voulues.keys()].sort() },
  })
}

export async function changerActivationRole(
  acteur: { id: bigint },
  role: string,
  actif: boolean
): Promise<void> {
  const ligne = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: { id: true, actif: true },
  })

  if (!ligne) throw new ErreurWorkflow('Rôle inconnu.')

  if (ligne.actif === actif) return

  if (!actif) {
    await verifierQuUnAdministrateurSubsiste({ role, actif: false })
  }

  await prisma.roles.update({
    where: { id: ligne.id },
    data: { actif, updated_at: new Date() },
  })

  await journaliser({
    action: actif ? 'role.active' : 'role.desactive',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligne.id),
    anciennes: { role, actif: ligne.actif },
    nouvelles: { role, actif },
  })
}

/**
 * Identifiant technique dérivé du libellé.
 *
 * Le nom sert de clé dans `model_has_roles` et dans le journal d'audit : il ne changera plus. On
 * le fabrique donc lisible et stable — accents retirés, minuscules, séparateurs unifiés — plutôt
 * que de demander à l'administrateur d'inventer un identifiant.
 */
export function nomTechnique(libelle: string): string {
  return libelle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

/**
 * Crée un rôle.
 *
 * ⚠️ CE COMMENTAIRE DISAIT L'INVERSE DE LA VÉRITÉ jusqu'au 2026-09-21, et le corriger n'est pas
 * cosmétique : il décourageait de créer des rôles métier.
 *
 * Il annonçait qu'un rôle créé ici « ne donne accès à aucun dossier, quelles que soient les
 * permissions cochées », parce que le cloisonnement par type (`authz/parcours.ts`), la table des
 * acteurs d'étape (`authz/etapes.ts`) et l'habilitation par site (`authz/site.ts`) nommaient les
 * rôles livrés. Aucune de ces trois tables n'existe plus : tout se lit en base et se coche dans
 * l'écran des habilitations.
 *
 * Un rôle créé ici peut donc TOUT faire — voir des dossiers, les faire avancer, être borné à un
 * site, être alerté en circuit accéléré. Ce qu'il faut savoir avant de le créer, c'est qu'il ne
 * fait RIEN tant que rien n'est coché : ses permissions seules ne lui ouvrent aucun type de
 * déclaration. L'écran le dit avant la création, et nomme les onglets où aller.
 */
export async function creerRole(
  acteur: { id: bigint },
  role: { libelle: string; description: string | null; permissions: readonly string[] }
): Promise<string> {
  const libelle = role.libelle.trim()
  const description = role.description?.trim() || null

  if (libelle.length < 3) {
    throw new ErreurWorkflow('Le libellé doit compter au moins 3 caractères.')
  }

  if (libelle.length > 255) {
    throw new ErreurWorkflow('Le libellé ne peut pas dépasser 255 caractères.')
  }

  if (description !== null && description.length > 1000) {
    throw new ErreurWorkflow('La description ne peut pas dépasser 1000 caractères.')
  }

  const name = nomTechnique(libelle)

  if (name.length < 3) {
    throw new ErreurWorkflow('Le libellé doit contenir au moins trois lettres ou chiffres.')
  }

  // Le catalogue des PERMISSIONS reste fermé — c'est le code qui décide ce qui existe. Seuls les
  // rôles, qui n'en sont que des assemblages, deviennent créables.
  const inconnues = role.permissions.filter((p) => !PERMISSIONS.includes(p as Permission))

  if (inconnues.length > 0) {
    throw new ErreurWorkflow(`Permission inconnue : ${inconnues.join(', ')}.`)
  }

  const existant = await prisma.roles.findFirst({
    where: { name, guard_name: GUARD },
    select: { libelle: true },
  })

  if (existant) {
    throw new ErreurWorkflow(`Un rôle porte déjà ce nom : « ${existant.libelle} ».`)
  }

  const maintenant = new Date()

  const cree = await prisma.roles.create({
    data: {
      name,
      guard_name: GUARD,
      libelle,
      description,
      actif: true,
      created_at: maintenant,
      updated_at: maintenant,
    },
    select: { id: true },
  })

  if (role.permissions.length > 0) {
    const lignes = await prisma.permissions.findMany({
      where: { name: { in: [...role.permissions] }, guard_name: GUARD },
      select: { id: true },
    })

    await prisma.role_has_permissions.createMany({
      data: lignes.map((p) => ({ role_id: cree.id, permission_id: p.id })),
    })
  }

  await journaliser({
    action: 'role.cree',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(cree.id),
    anciennes: null,
    nouvelles: { role: name, libelle, description, permissions: [...role.permissions].sort() },
  })

  return name
}

/**
 * Supprime un rôle — définitivement, et sous deux conditions strictes.
 *
 * 1. **Seul un rôle créé ici peut l'être.** Les rôles livrés sont nommés par le code : le
 *    cloisonnement par parcours, la table des acteurs d'étape et l'habilitation par site s'y
 *    réfèrent, et `chargerHabilitations()` les reconstituerait de toute façon à la lecture
 *    suivante. Pour eux, la désactivation reste la bonne opération — elle retire tous les droits
 *    sans effacer la trace.
 * 2. **Aucun compte ne doit le porter.** Supprimer un rôle rattaché retirerait son accès à
 *    quelqu'un sans que rien ne le dise, et l'association disparaîtrait avec lui : on ne saurait
 *    plus à qui rendre quoi. Détacher d'abord, supprimer ensuite — l'ordre est explicite.
 *
 * Le journal d'audit, lui, garde la ligne : le nom et les permissions du rôle supprimé y restent
 * lisibles, alors même que la table `roles` ne le contient plus.
 */
export async function supprimerRole(acteur: { id: bigint }, role: string): Promise<void> {
  /*
    ⚠️ UN RÔLE LIVRÉ PEUT DÉSORMAIS ÊTRE SUPPRIMÉ, à la seule condition que PERSONNE ne le porte
    (décision métier du 2026-09-20). La règle précédente l'interdisait absolument.

    Le risque est réel et assumé : le code se réfère à certains noms de rôle — la table des
    acteurs d'étape, le cloisonnement par rattachement. Un rôle supprimé n'y correspond plus à
    rien, et ces règles cessent simplement de le désigner. Rien ne casse, mais rien ne le signale
    non plus.

    C'est pourquoi la condition d'attribution, elle, ne bouge pas : tant qu'un compte le porte,
    supprimer le rôle lui retirerait ses accès sans que personne ne l'ait décidé pour lui.
  */

  const ligne = await prisma.roles.findFirst({
    where: { name: role, guard_name: GUARD },
    select: {
      id: true,
      libelle: true,
      role_has_permissions: { select: { permissions: { select: { name: true } } } },
      _count: { select: { model_has_roles: true } },
    },
  })

  if (!ligne) throw new ErreurWorkflow('Rôle inconnu.')

  if (ligne._count.model_has_roles > 0) {
    throw new ErreurWorkflow(
      `${ligne._count.model_has_roles} compte(s) portent encore « ${ligne.libelle} ». Retirez-leur ce rôle depuis la console des comptes avant de le supprimer.`
    )
  }

  const permissions = ligne.role_has_permissions.map((r) => r.permissions.name).sort()

  // Le journal est écrit AVANT la suppression : après, `auditableId` ne désignerait plus rien, et
  // le nom du rôle n'existerait nulle part ailleurs pour être rapproché de cette ligne.
  await journaliser({
    action: 'role.supprime',
    acteurId: acteur.id,
    auditableType: MODELES.role,
    auditableId: String(ligne.id),
    anciennes: { role, libelle: ligne.libelle, permissions },
    nouvelles: null,
  })

  await prisma.role_has_permissions.deleteMany({ where: { role_id: ligne.id } })
  await prisma.roles.delete({ where: { id: ligne.id } })
}

/** Permission qui donne accès à cet écran — donc la seule dont la perte soit irréversible. */
const CLE_ADMINISTRATION = 'roles.manage'

/**
 * Refuse une modification qui priverait le dispositif de tout administrateur.
 *
 * Sans application Laravel ni commande en ligne, plus personne ne pourrait rétablir la situation :
 * l'écran des habilitations deviendrait inaccessible à tous, définitivement.
 *
 * Deux chemins y mènent, et il faut les couvrir tous les deux — c'est pourquoi le contrôle
 * raisonne sur l'ÉTAT RÉSULTANT plutôt que sur l'opération demandée :
 *
 * - retirer `roles.manage` au dernier rôle qui le porte ;
 * - désactiver ce rôle, ce qui produit exactement le même effet sans toucher à ses permissions.
 *
 * Un contrôle écrit par opération aurait attrapé le premier cas et laissé passer le second.
 */
async function verifierQuUnAdministrateurSubsiste(hypothese: {
  role: string
  permissions?: ReadonlySet<string>
  actif?: boolean
}): Promise<void> {
  const roles = await prisma.roles.findMany({
    where: { guard_name: GUARD },
    select: {
      name: true,
      actif: true,
      role_has_permissions: { select: { permissions: { select: { name: true, guard_name: true } } } },
    },
  })

  // État tel qu'il SERA une fois la modification appliquée.
  const porteurs = roles
    .map((r) => {
      const concerne = r.name === hypothese.role

      const actif = concerne && hypothese.actif !== undefined ? hypothese.actif : r.actif
      const detient =
        concerne && hypothese.permissions !== undefined
          ? hypothese.permissions.has(CLE_ADMINISTRATION)
          : r.role_has_permissions.some(
              (rhp) =>
                rhp.permissions.name === CLE_ADMINISTRATION && rhp.permissions.guard_name === GUARD
            )

      return { name: r.name, conserve: actif && detient }
    })
    .filter((r) => r.conserve)
    .map((r) => r.name)

  if (porteurs.length === 0) {
    throw new ErreurWorkflow(
      `Impossible : « ${hypothese.role} » est le dernier rôle actif habilité à gérer les habilitations. Le retirer rendrait cet écran inaccessible à tous, définitivement.`
    )
  }

  // Un rôle habilité que personne ne porte ne sauve personne : il faut un compte ACTIF derrière.
  const associations = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, roles: { name: { in: porteurs } } },
    select: { model_id: true },
  })

  const comptesActifs = await prisma.users.count({
    where: { actif: true, id: { in: associations.map((a) => a.model_id) } },
  })

  if (comptesActifs === 0) {
    throw new ErreurWorkflow(
      'Impossible : aucun compte actif ne porterait plus la gestion des habilitations. Attribuez d’abord un rôle habilité à un compte actif.'
    )
  }
}
