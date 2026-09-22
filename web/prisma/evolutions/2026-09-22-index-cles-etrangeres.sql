-- Indexer les 31 clés étrangères qui n'en avaient aucune.
--
-- ⚠️ SANS TRANSACTION, ET C'EST OBLIGATOIRE. `CREATE INDEX CONCURRENTLY` ne peut pas s'exécuter
-- dans un bloc transactionnel : PostgreSQL refuse l'ordre avec « CREATE INDEX CONCURRENTLY cannot
-- run inside a transaction block ». Ce fichier n'a donc ni BEGIN ni COMMIT, et doit être appliqué
-- INSTRUCTION PAR INSTRUCTION — envoyer le fichier entier d'un coup place Postgres en transaction
-- implicite et fait échouer la première ligne.
--
-- ⚠️ POURQUOI `CONCURRENTLY` alors que la base de développement ne porte que quelques lignes : un
-- `CREATE INDEX` ordinaire verrouille la table en écriture le temps de la construction. Sur la
-- base de développement, invisible. En production, sur `audit_logs` ou `dossiers`, c'est une
-- interruption de service — et ce fichier sera rejoué là-bas tel quel.
--
-- ⚠️ LE CONSTAT (D1 de l'audit du 2026-09-22). PostgreSQL n'indexe PAS automatiquement les clés
-- étrangères — contrairement à MySQL, d'où vient ce schéma. Trente et une d'entre elles étaient
-- donc nues, dont six sur `dossiers`, la table la plus sollicitée de l'application.
--
-- Deux effets, et le second est le plus insidieux :
--
--   1. CHAQUE JOINTURE ou filtre sur ces colonnes devient un parcours séquentiel. La liste des
--      dossiers filtre par site, direction et statut : c'est l'écran le plus consulté.
--
--   2. CHAQUE SUPPRESSION d'une ligne parent balaie la table enfant EN ENTIER, verrou tenu, pour
--      vérifier qu'aucune ligne ne la cite. Or l'application offre la suppression des comptes,
--      des statuts, des catégories, des sites, des directions et des rôles. Supprimer un compte
--      vérifie aujourd'hui huit tables enfants, toutes sans index — dont `audit_logs`, qui est
--      celle qui grossit le plus vite.
--
-- Le coût est négligeable : ces colonnes sont des entiers, et l'écriture d'un index de plus sur
-- une insertion de dossier ne se mesure pas. Le gain, lui, croît avec le volume.

-- ---------------------------------------------------------------------------------------------
-- Le cœur : la table des dossiers et son historique
-- ---------------------------------------------------------------------------------------------
--
-- `dossiers` porte six clés nues. `site_id`, `direction_id` et `statut_id` sont filtrés par la
-- liste et le tableau de bord à chaque affichage ; `declarant_user_id` sert au contrôle DT-06
-- (« le déclarant n'instruit pas son propre dossier »), évalué sur chaque dossier d'une liste.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossiers_site_id_index" ON "dossiers" ("site_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossiers_direction_id_index" ON "dossiers" ("direction_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossiers_statut_id_index" ON "dossiers" ("statut_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossiers_categorie_id_index" ON "dossiers" ("categorie_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossiers_declarant_user_id_index" ON "dossiers" ("declarant_user_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossiers_canal_captage_id_index" ON "dossiers" ("canal_captage_id");

-- `historique_statuts` grandit à chaque transition de chaque dossier : c'est la table qui gonfle
-- le plus vite après `audit_logs`. Ses deux colonnes de statut sont vérifiées à chaque tentative
-- de suppression d'un statut — geste que l'écran d'administration propose.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "historique_statuts_statut_precedent_id_index" ON "historique_statuts" ("statut_precedent_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "historique_statuts_statut_suivant_id_index" ON "historique_statuts" ("statut_suivant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "historique_statuts_effectue_par_index" ON "historique_statuts" ("effectue_par");

-- ---------------------------------------------------------------------------------------------
-- Tout ce qu'une suppression de COMPTE doit vérifier
-- ---------------------------------------------------------------------------------------------
--
-- `supprimerCompte()` existe et est atteignable. Sans ces index, elle balaie huit tables entières
-- — dont le journal d'audit, qui ne fait que croître et qu'on ne purge jamais.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_user_id_index" ON "audit_logs" ("user_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "investigations_enqueteur_id_index" ON "investigations" ("enqueteur_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "investigations_valide_par_index" ON "investigations" ("valide_par");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "actions_correctives_responsable_id_index" ON "actions_correctives" ("responsable_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "pieces_jointes_televerse_par_index" ON "pieces_jointes" ("televerse_par");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_expediteur_user_id_index" ON "messages" ("expediteur_user_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dossier_affectations_affecte_par_index" ON "dossier_affectations" ("affecte_par");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "qr_codes_genere_par_index" ON "qr_codes" ("genere_par");

-- Le rattachement d'un compte, filtré par la console des comptes et vérifié à la suppression
-- d'un site ou d'une direction. `responsable_hierarchique_id` pointe vers `users` elle-même.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_site_id_index" ON "users" ("site_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_direction_id_index" ON "users" ("direction_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_responsable_hierarchique_id_index" ON "users" ("responsable_hierarchique_id");

-- ---------------------------------------------------------------------------------------------
-- Le paramétrage : ce qu'une suppression de RÔLE, de TYPE ou de STATUT doit vérifier
-- ---------------------------------------------------------------------------------------------
--
-- Ces tables sont petites en nombre de lignes mais consultées à CHAQUE requête authentifiée :
-- `chargerUtilisateurAutorise()` relit rôles, permissions, types et étapes à chaque vérification
-- d'autorisation, par choix de conception assumé.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "role_has_permissions_role_id_index" ON "role_has_permissions" ("role_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "role_parcours_parcours_id_index" ON "role_parcours" ("parcours_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "role_etapes_parcours_id_index" ON "role_etapes" ("parcours_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "role_etapes_statut_id_index" ON "role_etapes" ("statut_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "utilisateur_parcours_parcours_id_index" ON "utilisateur_parcours" ("parcours_id");

-- ---------------------------------------------------------------------------------------------
-- Reporting et référentiels liés à un type de déclaration
-- ---------------------------------------------------------------------------------------------
--
-- `statistiques_mensuelles` est vide aujourd'hui et grossit d'une ligne par combinaison
-- (type × catégorie × gravité) chaque mois. Ses trois colonnes sont exactement celles par
-- lesquelles l'historique mensuel regroupe.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "statistiques_mensuelles_parcours_id_index" ON "statistiques_mensuelles" ("parcours_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "statistiques_mensuelles_categorie_id_index" ON "statistiques_mensuelles" ("categorie_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "statistiques_mensuelles_niveau_gravite_id_index" ON "statistiques_mensuelles" ("niveau_gravite_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_templates_parcours_id_index" ON "notification_templates" ("parcours_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "qr_codes_parcours_id_index" ON "qr_codes" ("parcours_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "actions_correctives_investigation_id_index" ON "actions_correctives" ("investigation_id");
