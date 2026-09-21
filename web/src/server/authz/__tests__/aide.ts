import { PARCOURS_CODES, type ParcoursCode } from '../parcours'
import type { Permission } from '../permissions'
import { ROLES, type Role } from '../roles'
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
const PARCOURS_LIVRES: Partial<Record<Role, readonly ParcoursCode[]>> = {
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
const TRAITENT_LES_DOSSIERS = new Set<Role>([
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
 * Fabrique un utilisateur autorisé à partir de ses rôles, en résolvant ses permissions ET ses
 * types de déclaration exactement comme le ferait `chargerUtilisateurAutorise()` depuis la base.
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
    for (const permission of ROLES[role]) {
      permissions.add(permission)
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
