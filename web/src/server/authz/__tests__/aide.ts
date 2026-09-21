import { PARCOURS_CODES, type ParcoursCode } from '../parcours'
import type { Permission } from '../permissions'
import { ROLES, type Role, type RoleLivre } from '../roles'
import { cloisonnePourSesRoles, donneAccesAuxDossiers } from '../site'
import type { UtilisateurAutorise } from '../utilisateur'

let prochainId = 1n

/**
 * Types de déclaration ouverts par chaque rôle — REFLET du paramétrage livré.
 *
 * ⚠️ CE N'EST PLUS LA RÈGLE, c'est une copie de l'état initial. La règle vit en base
 * (`role_parcours`) et se coche dans les habilitations depuis le 2026-09-20 ; ce tableau ne fait
 * que reproduire ce que la migration y a inscrit, pour que les cas unitaires disposent d'un
 * compte vraisemblable sans toucher la base.
 *
 * ⚠️ `habilitation-parcours.test.ts` compare ce reflet à la base : le laisser dériver ferait
 * passer des cas sur un paramétrage qui n'existe nulle part.
 */
const PARCOURS_LIVRES: Record<string, readonly ParcoursCode[]> = {
  charge_securite: ['ei_employe'],
  secretaire_csst: ['ei_employe'],
  rqse: ['ei_employe'],

  correspondant_drh: ['grief_employe'],
  correspondant_dadd: ['grief_communaute'],
  correspondant_dl: ['grief_sous_traitant'],

  responsable_mgp_structure: ['grief_employe', 'grief_sous_traitant', 'grief_communaute'],
  correspondant_mgp: ['grief_employe', 'grief_sous_traitant', 'grief_communaute'],

  rgp: ['grief_employe'],
  responsable_grief_employe: ['grief_employe'],
  comite_ethique: ['grief_employe'],
  captage_grief_soustraitant: ['grief_sous_traitant'],
  captage_grief_communaute: ['grief_communaute'],

  service_mgp: [...PARCOURS_CODES],
  dg: [...PARCOURS_CODES],
  auditeur: [...PARCOURS_CODES],
  dpo: [...PARCOURS_CODES],
}

/**
 * Rôles qui ont la CHARGE des dossiers — reflet du paramétrage livré.
 *
 * ⚠️ CE N'EST PLUS UNE DÉDUCTION. « Traiter » se lisait dans `dossiers.status.update` : le
 * Service MGP, qui porte ce droit sans instruire, apparaissait comme titulaire de tous les
 * dossiers. C'est une donnée d'organisation, cochée rôle par rôle dans les habilitations.
 *
 * ⚠️ `habilitation-parcours.test.ts` compare ce reflet à la base, comme pour les parcours : le
 * laisser dériver ferait passer des cas sur un paramétrage qui n'existe nulle part.
 */
const TRAITENT_LES_DOSSIERS = new Set<string>([
  'charge_securite',
  'secretaire_csst',
  'rqse',
  'correspondant_drh',
  'correspondant_dadd',
  'correspondant_dl',
  'correspondant_mgp',
  'responsable_mgp_structure',
  'responsable_grief_employe',
])

/**
 * Rôles bornés à leur site ou à leur direction — reflet du paramétrage livré.
 *
 * ⚠️ CETTE LISTE ÉTAIT `ROLES_CLOISONNES_PAR_SITE`, dans `authz/site.ts`. Elle a quitté le code le
 * 2026-09-21 : un rôle créé depuis l'interface n'y figurait pas, voyait tous les sites, et rien ne
 * le signalait. Elle n'est ici que comme reflet, et un test la compare à la base.
 */
const CLOISONNES_PAR_RATTACHEMENT = new Set<string>([
  'secretaire_csst',
  'rqse',
  'rgp',
  'captage_grief_communaute',
  'captage_grief_soustraitant',
  'charge_securite',
  'responsable_mgp_structure',
])

/** Ne voient que leurs propres déclarations (RG-06) — reflet du paramétrage livré. */
const VOIENT_SEULEMENT_LEURS_DECLARATIONS = new Set<string>(['employe_declarant'])

/** Accès « sans données nominatives » : ceux-là ne voient jamais qui a déclaré. */
const SANS_IDENTITE_DECLARANT = new Set<string>(['comite_ethique'])

/**
 * Les étapes que le CDC DÉSIGNE nommément — reflet de ce que la migration a inscrit.
 *
 * ⚠️ CETTE TABLE ÉTAIT `ACTEURS`, dans `authz/etapes.ts`. Elle vit maintenant dans `role_etapes`
 * et se coche dans une grille type × étape. Elle n'est ici que comme reflet, pour que les cas
 * unitaires disposent d'un compte vraisemblable, et `etapes.test.ts` la compare à la base.
 */
const ETAPES_DESIGNEES: Record<ParcoursCode, Record<string, readonly string[]>> = {
  ei_employe: {
    recu: ['charge_securite', 'service_mgp'],
    affecte: ['charge_securite', 'secretaire_csst', 'rqse'],
    en_analyse: ['charge_securite', 'secretaire_csst', 'rqse'],
    reouvert: ['service_mgp', 'dg'],
  },
  grief_employe: {
    recu: ['service_mgp'],
    affecte: [
      'responsable_grief_employe',
      'correspondant_drh',
      'responsable_mgp_structure',
      'correspondant_mgp',
      'rqse',
    ],
    en_analyse: [
      'responsable_grief_employe',
      'correspondant_drh',
      'responsable_mgp_structure',
      'correspondant_mgp',
      'rqse',
    ],
    en_investigation: ['dg', 'service_mgp'],
    reouvert: ['service_mgp', 'dg'],
  },
  grief_sous_traitant: {
    recu: ['service_mgp'],
    affecte: ['correspondant_dl', 'responsable_mgp_structure', 'correspondant_mgp'],
    en_analyse: ['correspondant_dl', 'responsable_mgp_structure', 'correspondant_mgp'],
    en_investigation: ['correspondant_dl', 'responsable_mgp_structure', 'correspondant_mgp'],
    reouvert: ['service_mgp', 'dg'],
  },
  grief_communaute: {
    recu: ['service_mgp'],
    affecte: [
      'service_mgp',
      'correspondant_dadd',
      'responsable_mgp_structure',
      'correspondant_mgp',
    ],
    en_analyse: [
      'service_mgp',
      'correspondant_dadd',
      'responsable_mgp_structure',
      'correspondant_mgp',
    ],
    reouvert: ['service_mgp', 'dg'],
  },
}

/**
 * Les étapes que le code laissait OUVERTES à tous ceux qui en avaient le droit.
 *
 * ⚠️ UN CHANGEMENT DE DÉFAUT, ET IL EST VOLONTAIRE. Dans le code, une étape absente de la table
 * des acteurs signifiait « ouverte à tous ceux qui portent `dossiers.status.update` ». Cette
 * nuance ne survit pas en base, où l'absence de ligne se lit comme une interdiction : la migration
 * a donc donné une ligne à chacun de ces rôles, sur chacune de ces étapes.
 *
 * Reproduire ici la même dérivation, plutôt que de recopier les cent lignes qu'elle produit, est
 * ce qui garde le reflet fidèle — et le test qui le compare à la base le vérifie.
 */
function etapesOuvertes(role: string): { parcours: string; statut: string }[] {
  const permissions: readonly string[] = ROLES[role as RoleLivre] ?? []

  if (!permissions.includes('dossiers.status.update')) return []

  const cases: { parcours: string; statut: string }[] = []

  for (const parcours of PARCOURS_CODES) {
    for (const statut of ['en_attente_information', 'action_corrective_en_cours']) {
      cases.push({ parcours, statut })
    }

    if (parcours === 'ei_employe' || parcours === 'grief_communaute') {
      cases.push({ parcours, statut: 'en_investigation' })
    }
  }

  return cases
}

/** Toutes les cases cochées pour ce rôle — les désignées et celles que la reprise a ajoutées. */
export function etapesLivrees(role: string): { parcours: string; statut: string }[] {
  const cases = etapesOuvertes(role)

  for (const parcours of PARCOURS_CODES) {
    for (const [statut, roles] of Object.entries(ETAPES_DESIGNEES[parcours])) {
      if (roles.includes(role)) cases.push({ parcours, statut })
    }
  }

  // Dédoublonné : une étape peut être à la fois désignée et ouverte, et la base ne porte qu'une
  // ligne par couple (contrainte d'unicité).
  return [...new Map(cases.map((c) => [`${c.parcours}/${c.statut}`, c])).values()]
}

/**
 * Fabrique un utilisateur autorisé à partir de ses rôles, en résolvant ses permissions, ses types
 * de déclaration, ses étapes et ses comportements exactement comme le ferait
 * `chargerUtilisateurAutorise()` depuis la base.
 *
 * ⚠️ LES TYPES VIENNENT DES RÔLES, et plus d'une attribution par personne : celle-ci a été
 * supprimée le 2026-09-20, le rôle décide seul. Un rôle absent de `PARCOURS_LIVRES` n'ouvre
 * aucun dossier — c'est le cas de `administrateur_digital`, `agent_relais` et
 * `employe_declarant`.
 *
 * Pour poser un périmètre différent du paramétrage livré — un rôle dont on vient de décocher un
 * type —, `utilisateurAvecParcours()` oblige à l'énoncer.
 */
export function utilisateurAvecRoles(...roles: Role[]): UtilisateurAutorise {
  const permissions = new Set<Permission>()
  for (const role of roles) {
    for (const permission of ROLES[role as RoleLivre] ?? []) {
      permissions.add(permission as Permission)
    }
  }

  // Sans site : le cloisonnement par site ne s'applique donc pas par défaut, et les cas qui le
  // visent le posent explicitement. Un défaut arbitraire ferait passer pour du cloisonnement ce
  // qui ne serait qu'un effet de l'outillage.
  return {
    id: prochainId++,
    actif: true,
    siteId: null,
    // Ni site ni direction : le cloisonnement par rattachement ne s'applique donc pas par
    // défaut, et les cas qui le visent le posent explicitement.
    directionId: null,
    doitChangerMotDePasse: false,
    roles,
    permissions,
    parcours: [...new Set(roles.flatMap((role) => PARCOURS_LIVRES[role] ?? []))],
    traiteLesDossiers: roles.some((role) => TRAITENT_LES_DOSSIERS.has(role)),
    /*
      ⚠️ TOUS SES RÔLES PORTEURS, pas un seul — la même règle que `chargerUtilisateurAutorise()`,
      appelée et non recopiée. « Cumuler n'est pas être deux fois restreint, c'est porter un mandat
      plus large » : un reflet qui dirait « au moins un » ferait passer des cas sur une règle que
      l'application n'applique pas.
    */
    cloisonneParRattachement: cloisonnePourSesRoles(
      roles.map((role) => ({
        cloisonne: CLOISONNES_PAR_RATTACHEMENT.has(role),
        donneAcces: donneAccesAuxDossiers(ROLES[role as RoleLivre] ?? []),
      }))
    ),
    voitSeulementSesDeclarations: roles.some((role) =>
      VOIENT_SEULEMENT_LEURS_DECLARATIONS.has(role)
    ),
    // Vrai par défaut : c'est le RETRAIT qui se décide, rôle par rôle.
    voitIdentiteDeclarant: !roles.some((role) => SANS_IDENTITE_DECLARANT.has(role)),
    etapes: [
      ...new Map(
        roles.flatMap(etapesLivrees).map((c) => [`${c.parcours}/${c.statut}`, c])
      ).values(),
    ],
  }
}

/**
 * Le même utilisateur, avec les types de déclaration EXPLICITEMENT posés.
 *
 * Passer une liste vide décrit un rôle dont toutes les cases ont été décochées : il ne doit alors
 * ouvrir aucun dossier, quels que soient ses droits.
 */
export function utilisateurAvecParcours(
  parcours: readonly ParcoursCode[],
  ...roles: Role[]
): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(...roles), parcours }
}

/** Le même utilisateur, rattaché à un site — pour les cas qui exercent le cloisonnement. */
export function utilisateurDuSite(siteId: bigint, ...roles: Role[]): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(...roles), siteId }
}

/**
 * Le même utilisateur, avec les ÉTAPES explicitement posées.
 *
 * ⚠️ INDISPENSABLE DEPUIS QUE L'ABSENCE INTERDIT. Un cas qui veut exercer « ce compte ne peut pas
 * franchir cette marche » devait auparavant choisir un rôle qui n'y figurait pas ; il doit
 * maintenant pouvoir décrire une grille vide, ou une grille d'une seule case.
 */
export function utilisateurAvecEtapes(
  etapes: readonly { readonly parcours: string; readonly statut: string }[],
  ...roles: Role[]
): UtilisateurAutorise {
  return { ...utilisateurAvecRoles(...roles), etapes }
}
