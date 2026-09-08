/**
 * Point d'entrée unique de la couche d'autorisation.
 *
 * Toute vérification de droit dans l'application doit importer depuis ce module — jamais
 * réimplémenter un test de rôle ou de permission à la main dans une page ou une Server Action.
 */
export * from './permissions'
export * from './libelles'
export * from './roles'
export * from './parcours'
export * from './utilisateur'
export * from './policies/dossier'
export * from './policies/investigation'
export * from './policies/action-corrective'
export * from './policies/message'
export * from './policies/audit-log'
export * from './policies/export'
