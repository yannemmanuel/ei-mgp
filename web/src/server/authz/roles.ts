import type { Permission } from './permissions'

/**
 * Rôles applicatifs et leurs permissions — port fidèle de
 * `database/seeders/RolePermissionSeeder.php::ROLES` (Laravel), docs/acteurs.md §2.
 *
 * Le cloisonnement par PARCOURS (RQSE ne voit que l'EI, etc.) n'est PAS exprimé ici : il vit
 * dans `./parcours.ts`, appliqué par les policies. Ne jamais le réintroduire sous forme de
 * permission — les deux dimensions sont volontairement orthogonales.
 */
export const ROLES = {
  employe_declarant: ['dossiers.view.own', 'messagerie.view', 'messagerie.send'],

  agent_relais: ['dossiers.create'],

  secretaire_csst: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close',
  ],

  rqse: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update',
  ],

  rgp: ['dossiers.create', 'dossiers.view.own'],

  responsable_grief_employe: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.validate',
    'actions.view', 'actions.create', 'actions.update',
  ],

  /**
   * ⚠️ REMPLACÉ par les trois correspondants ci-dessous, et désactivé en base.
   *
   * Un seul rôle ouvrait les trois types de grief à quiconque le portait, alors que le métier
   * confie chaque type à un correspondant distinct. Il reste défini ici, et c'est délibéré :
   * `LIBELLES_ROLE` et le journal d'audit s'y réfèrent, deux comptes l'ont porté, et un rôle
   * désactivé doit rester nommable pour que son historique se lise.
   */
  correspondant_mgp: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update',
    'messagerie.view', 'messagerie.send',
  ],

  /*
    Les trois correspondants de grief — un type de grief chacun.

    Mêmes droits, périmètres disjoints : c'est `ROLES_PAR_PARCOURS` qui les sépare, jamais leurs
    permissions. Exprimer la séparation ici, en accordant des droits différents, l'aurait rendue
    invisible aux policies et impossible à vérifier d'un seul endroit.
  */
  correspondant_drh: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update',
    'messagerie.view', 'messagerie.send',
  ],

  correspondant_dadd: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update',
    'messagerie.view', 'messagerie.send',
  ],

  correspondant_dl: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update',
    'messagerie.view', 'messagerie.send',
  ],

  /**
   * Responsable MGP de structure : les trois types de grief, mais de SA structure seulement.
   *
   * Deux cloisonnements en série — les parcours de grief d'un côté (`ROLES_PAR_PARCOURS`), le
   * site de l'autre (`ROLES_CLOISONNES_PAR_SITE`). « Structure » se lit ici comme le site, qui
   * découle de la direction choisie à la déclaration : c'est le seul découpage déjà porté par
   * chaque dossier, y compris ceux des sous-traitants et des riverains, qui n'ont pas de
   * direction.
   */
  responsable_mgp_structure: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.validate',
    'actions.view', 'actions.create', 'actions.update',
    'messagerie.view', 'messagerie.send',
  ],

  /**
   * Chargé de sécurité du site : tout le traitement de l'évènement indésirable.
   *
   * Il remplace le Secrétaire CSST et le RQSE, désactivés. Il qualifie la gravité, mène
   * l'investigation, construit le plan d'action et le complète après chaque comité.
   *
   * ⚠️ NI `dossiers.assign` NI `dossiers.reassign`, et ce n'est pas un oubli. Les évènements
   * indésirables ne s'affectent plus à personne : le chargé de sécurité voit tous ceux de son
   * site et les traite. Lui donner le droit d'affecter rouvrirait, compte par compte, le circuit
   * que cette décision supprime.
   */
  charge_securite: [
    'dossiers.view', 'dossiers.status.update', 'dossiers.close', 'dossiers.reopen',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close',
    'messagerie.view', 'messagerie.send',
  ],

  service_mgp: [
    'dossiers.view.all', 'dossiers.assign', 'dossiers.reassign', 'dossiers.status.update',
    'dossiers.close', 'dossiers.reopen',
    'investigations.view', 'investigations.validate',
    'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close',
    'messagerie.view', 'messagerie.send',
    'notifications.templates.manage',
    'referentiels.categories.manage', 'referentiels.statuts.manage', 'referentiels.sites.manage',
    'referentiels.delais.manage', 'referentiels.gravites.manage',
    'reporting.view', 'reporting.export', 'reporting.export.nominatif',
    'audit.view',
  ],

  // docs/acteurs.md : accès "sans données nominatives" — la restriction d'identité elle-même
  // n'est pas une permission, elle est appliquée à l'affichage (cf. étape 6).
  comite_ethique: ['dossiers.view'],

  captage_grief_communaute: ['dossiers.create', 'dossiers.view.own'],

  captage_grief_soustraitant: ['dossiers.create', 'dossiers.view.own'],

  dg: [
    'dossiers.view.all', 'dossiers.status.update', 'dossiers.reopen',
    'reporting.view', 'reporting.export',
  ],

  dpo: ['dossiers.view.all', 'rgpd.conservation.manage', 'rgpd.acces.view', 'audit.view'],

  // DT-02 : aucun accès aux dossiers, volontairement. Paramétrage technique uniquement.
  administrateur_digital: ['qrcodes.manage', 'users.manage', 'roles.manage', 'canaux.manage'],

  auditeur: ['dossiers.view.all', 'audit.view', 'reporting.view', 'reporting.export'],
} as const satisfies Record<string, readonly Permission[]>

export type Role = keyof typeof ROLES

export const ROLE_NAMES = Object.keys(ROLES) as Role[]
