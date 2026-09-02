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

  correspondant_mgp: [
    'dossiers.view', 'dossiers.status.update',
    'investigations.view', 'investigations.create', 'investigations.update',
    'actions.view', 'actions.create', 'actions.update',
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
