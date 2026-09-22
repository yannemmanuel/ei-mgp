/**
 * Catalogue des permissions applicatives.
 *
 * Convention : `ressource.action[.portée]`.
 *
 * ⚠️ CATALOGUE FERMÉ, contrairement aux rôles — qui, eux, se créent depuis l'écran des
 * habilitations. Chaque permission correspond à un endroit du code qui la LIT : en ajouter une
 * suppose donc d'écrire ce code. Une permission accordée en base sans lecteur ne confère rien,
 * tout en ayant l'air d'accorder quelque chose.
 *
 * `__tests__/catalogue-autorisation.test.ts` compare cette liste au contenu réel de la table
 * `permissions` et échoue à la moindre divergence.
 */
export const PERMISSIONS = [
  // Dossiers
  'dossiers.view',
  'dossiers.view.own',
  'dossiers.view.all',
  'dossiers.create',
  'dossiers.assign',
  'dossiers.reassign',
  'dossiers.status.update',
  'dossiers.close',
  'dossiers.reopen',
  // Investigations
  'investigations.view',
  'investigations.create',
  'investigations.update',
  'investigations.validate',
  // Actions correctives
  'actions.view',
  'actions.create',
  'actions.update',
  'actions.verify_efficacite',
  'actions.close',
  // Messagerie sécurisée
  'messagerie.view',
  'messagerie.send',
  // Notifications
  'notifications.templates.manage',
  // Référentiels métier
  'referentiels.categories.manage',
  'referentiels.statuts.manage',
  'referentiels.sites.manage',
  // Délais SLA et niveaux de gravité — rendus administrables sur décision du métier : les
  // valeurs « à valider » du CDC §1.8 point 4 se règlent sans déploiement.
  'referentiels.delais.manage',
  'referentiels.gravites.manage',
  // Référentiels techniques
  'qrcodes.manage',
  'users.manage',
  'roles.manage',
  'canaux.manage',
  // Reporting
  'reporting.view',
  'reporting.export',
  'reporting.export.nominatif',
  // Audit — lecture seule : aucune permission audit.update/audit.delete n'existe
  // (docs/exigences-audit.md §3), et il ne doit jamais en être ajouté.
  'audit.view',
  // RGPD
  'rgpd.conservation.manage',
  'rgpd.acces.view',
] as const

export type Permission = (typeof PERMISSIONS)[number]
