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

/** Quels types de déclaration chaque rôle ouvre — lu dans `role_parcours`, libellé compris. */
export async function parcoursParRole(): Promise<
  Map<string, { code: ParcoursCode; libelle: string; alerteCircuitCritique: boolean }[]>
> {
  const lignes = await prisma.role_parcours.findMany({
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
 * Lu dans la même colonne que l'autorisation elle-même : une liste écrite en dur ignorait les
 * rôles créés depuis l'interface, qui voyaient alors tous les sites.
 */
export async function cloisonnementParRole(): Promise<
  Map<string, { cloisonne: boolean; donneAcces: boolean }>
> {
  const lignes = await prisma.roles.findMany({
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
 * La base fait foi — `chargerUtilisateurAutorise()` la relit à chaque requête, donc toute
 * modification prend effet immédiatement. Le code garde la main sur ce qui EXISTE (catalogue
 * fermé des permissions et des rôles), la base sur qui obtient quoi. L'écart avec
 * `authz/roles.ts`, la configuration livrée, est affiché sans être traité comme une anomalie.
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
  /** Rôle du CDC, décrit par le code — voir `supprimerRole()` pour ce que cela change. */
  readonly livre: boolean
  /**
   * Nombre de comptes RATTACHÉS, actifs ou non.
   *
   * Distinct de `comptes` : celui-ci sert à décider si le rôle peut être supprimé sans retirer
   * son accès à quelqu'un, et un compte désactivé aujourd'hui peut être réactivé demain.
   */
  readonly rattachements: number
  /** Types de déclaration ouverts. ⚠️ Vide = ce rôle ne donne accès à AUCUN dossier. */
  readonly parcours: readonly {
    readonly code: ParcoursCode
    readonly libelle: string
    /** RG-08 : alerté immédiatement quand une déclaration de CE type est qualifiée critique. */
    readonly alerteCircuitCritique: boolean
  }[]
  /** Les quatre comportements du rôle, tels qu'ils se cochent — voir `COMPORTEMENTS_ROLE`. */
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
 * ⚠️ Catalogue FERMÉ, à la différence des rôles : chaque comportement est un endroit du code qui
 * lit la colonne, donc en ajouter un demande un déploiement. Ce qui est libre, c'est de décider
 * quel rôle le porte. Libellé et aide vivent ici, que trois écrans affichent sans les reformuler.
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
 * ⚠️ Seulement celles d'où l'on peut PARTIR : « Résolu » et « Clos » n'ont aucune transition
 * sortante, et les afficher ferait croire à des cases oubliées.
 */
export async function etapesACocher(): Promise<EtapeACocher[]> {
  const lignes = await prisma.statuts_dossier.findMany({
    orderBy: { ordre: 'asc' },
    select: { code: true, libelle_interne: true, actif: true },
  })

  return lignes
    .filter(
      (l) =>
        (STATUTS as readonly string[]).includes(l.code) &&
        transitionsDepuis(l.code as StatutCode).length > 0 &&
        /*
          ⚠️ Et le statut doit être ACTIF : aucun dossier n'atteint un statut inactif, donc les
          cases cochées sur sa colonne ne commandaient rien et faussaient le contrôle « étape sans
          acteur ». Réactiver le statut fait revenir la colonne avec ses lignes — `role_etapes`
          n'est pas touchée.
        */
        l.actif
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

const MODEL_TYPE_USER = MODELES.utilisateur

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

  // `model_has_roles` est POLYMORPHE : elle n'a pas de relation vers `users`,
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

  // Union du code ET de la base : partir du seul catalogue rendait invisible un rôle créé depuis
  // l'interface, qui s'appliquait pourtant aux comptes le portant.
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
        Faux pour un rôle décrit par le code mais absent de la base : il ne confère rien.

        ⚠️ `voit_identite_declarant` est vrai par défaut, à l'inverse des trois autres : c'est un
        RETRAIT qui se coche, et un rôle non paramétré doit voir ce que voient les autres.
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
 * Le sens de l'écart compte, et aucun n'est fautif en soi : une permission retirée prive d'un
 * accès prévu, une permission ajoutée en accorde un qui ne l'était pas.
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
 * L'effet est immédiat pour tout le monde, sans redéploiement. D'où trois garde-fous :
 *
 * 1. Le catalogue reste fermé — un nom forgé ne peut pas créer d'association.
 * 2. Au moins un compte actif doit conserver `roles.manage` : aucune commande en ligne ne
 *    permettrait de revenir en arrière.
 * 3. Tout changement est journalisé, avec son auteur et sa date.
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
    where: { name: role },
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
      where: { name: { in: aAjouter } },
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
 * ⚠️ Effet immédiat pour tous les porteurs du rôle, sans reconnexion — d'où la journalisation.
 *
 * L'absence vaut retrait : la liste reçue décrit l'état complet du rôle, pas un ajout.
 */
export async function modifierParcoursRole(
  acteur: { id: bigint },
  role: string,
  parcoursVoulus: readonly string[],
  /*
    ⚠️ Les alertes de circuit accéléré vivent sur la même ligne que le type
    (`role_parcours.alerte_circuit_critique`) et s'enregistrent donc dans le même geste. L'alerte
    d'un type non coché est ignorée : décocher le type emporte son alerte, sans surprise.
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
    where: { name: role },
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
 * ⚠️ `name`, l'identifiant technique, n'est pas exposé. Référencé par `model_has_roles`,
 * `authz/roles.ts` et `role_parcours`, le renommer romprait le périmètre sans lever d'erreur.
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
    where: { name: role },
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
 * Un rôle inactif ne confère plus ni permission ni parcours, dès la requête suivante. Les
 * associations `model_has_roles` sont conservées : la réactivation rend leurs droits aux comptes
 * sans réattribution — c'est la différence entre suspendre un rôle et le vider.
 */
/**
 * Un des quatre comportements du rôle — voir `COMPORTEMENTS_ROLE`.
 *
 * ⚠️ Effet immédiat pour tous les porteurs du rôle, sans reconnexion — d'où la journalisation.
 *
 * ⚠️ « A la charge » est distinct de `dossiers.status.update` : ce droit dit qu'on peut faire
 * AVANCER un dossier, ce paramètre qu'on en RÉPOND. Le Service MGP porte le droit sans la charge ;
 * déduire l'un de l'autre le faisait apparaître titulaire de tous les dossiers.
 */
export async function changerComportementRole(
  acteur: { id: bigint },
  role: string,
  comportement: ComportementRole,
  valeur: boolean
): Promise<void> {
  // ⚠️ Nom de colonne validé contre le catalogue : il vient d'un formulaire et sert de clé dans
  // un `data:` Prisma. Sans cette garde, un champ forgé atteindrait `actif`, par exemple.
  if (!(COMPORTEMENTS_NOMS as readonly string[]).includes(comportement)) {
    throw new ErreurWorkflow('Comportement inconnu.')
  }

  const ligne = await prisma.roles.findFirst({
    where: { name: role },
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
    // TODO renommer en `role.comportement_modifie`, une fois le libellé ajouté à
    // `audit/libelles.ts` — sans quoi le journal afficherait un code brut.
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
 * ⚠️ Décocher la dernière case d'une colonne BLOQUE le circuit sans aucune erreur : le dossier
 * arrive à cette étape et n'en repart jamais. `santeAdministration()` est le seul endroit qui
 * remonte ces colonnes vides.
 *
 * L'absence vaut retrait : la liste reçue décrit l'état complet du rôle, pas un ajout.
 */
export async function modifierEtapesRole(
  acteur: { id: bigint },
  role: string,
  casesVoulues: readonly { readonly parcours: string; readonly statut: string }[]
): Promise<void> {
  const ligneRole = await prisma.roles.findFirst({
    where: { name: role },
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

  // ⚠️ Validé case par case contre la base ET le graphe des transitions : un couple inconnu, ou
  // portant une étape terminale, entrerait en base sans jamais rien autoriser.
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
    where: { name: role },
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
 * Clé dans `model_has_roles` et dans le journal : il ne changera plus. Fabriqué lisible et stable
 * plutôt que demandé à l'administrateur.
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
 * Un rôle créé ici peut tout faire : voir des dossiers, les faire avancer, être borné à un site,
 * être alerté en circuit accéléré. ⚠️ Mais il ne fait RIEN tant que rien n'est coché — ses
 * permissions seules ne lui ouvrent aucun type de déclaration. L'écran le dit avant la création.
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
    where: { name },
    select: { libelle: true },
  })

  if (existant) {
    throw new ErreurWorkflow(`Un rôle porte déjà ce nom : « ${existant.libelle} ».`)
  }

  const maintenant = new Date()

  const cree = await prisma.roles.create({
    data: {
      name,
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
      where: { name: { in: [...role.permissions] } },
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
 * Supprime un rôle, définitivement.
 *
 * ⚠️ Aucun compte ne doit le porter : supprimer un rôle rattaché retirerait un accès sans rien
 * dire, et l'association disparaîtrait avec lui. Détacher d'abord, supprimer ensuite.
 *
 * Le journal garde la ligne : nom et permissions du rôle supprimé y restent lisibles.
 */
export async function supprimerRole(acteur: { id: bigint }, role: string): Promise<void> {
  /*
    ⚠️ Un rôle LIVRÉ peut aussi être supprimé (décision du 2026-09-20), à la seule condition que
    personne ne le porte. Risque assumé : le code se réfère à certains noms de rôle, qui cessent
    alors de désigner quoi que ce soit — rien ne casse, mais rien ne le signale non plus.
  */

  const ligne = await prisma.roles.findFirst({
    where: { name: role },
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
 * Refuse une modification qui priverait le dispositif de tout administrateur — définitivement,
 * aucune commande en ligne ne permettant de rétablir la situation.
 *
 * ⚠️ Raisonne sur l'ÉTAT RÉSULTANT et non sur l'opération : retirer `roles.manage` au dernier
 * rôle qui le porte et désactiver ce rôle produisent le même effet.
 */
async function verifierQuUnAdministrateurSubsiste(hypothese: {
  role: string
  permissions?: ReadonlySet<string>
  actif?: boolean
}): Promise<void> {
  const roles = await prisma.roles.findMany({
    select: {
      name: true,
      actif: true,
      role_has_permissions: { select: { permissions: { select: { name: true } } } },
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
                rhp.permissions.name === CLE_ADMINISTRATION
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
