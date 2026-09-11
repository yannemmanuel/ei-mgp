-- Réorganisation des rôles : chargé de sécurité, correspondants par type de grief.
--
-- ⚠️ ADDITIVE. Cinq rôles créés, TROIS DÉSACTIVÉS — aucun supprimé, aucune association retirée.
--
-- Le métier réorganise deux circuits d'un coup :
--
-- 1. L'ÉVÈNEMENT INDÉSIRABLE n'est plus affecté. Son traitement revient au chargé de sécurité du
--    site, qui complète le dossier après chaque comité. Il remplace le Secrétaire CSST et le
--    RQSE. Il n'a NI `dossiers.assign` NI `dossiers.reassign` : il ne peut affecter l'évènement
--    à personne, il le traite.
--
-- 2. LES GRIEFS se répartissent par type : Correspondant DRH pour les employés, DADD pour les
--    communautaires, DL pour les sous-traitants. Le Correspondant MGP, qui ouvrait les trois à
--    quiconque le portait, est remplacé par ces trois-là. S'y ajoute le Responsable MGP de
--    structure, qui voit les trois types mais sur son seul site.
--
-- ⚠️ DÉSACTIVÉS, jamais supprimés. `chargerUtilisateurAutorise()` ne tire plus aucun droit d'un
-- rôle inactif : la coupure est immédiate, au prochain appel, sans attendre de reconnexion. Mais
-- les lignes `model_has_roles` restent, si bien que réactiver un rôle rend leurs droits à ceux
-- qui le portaient, sans réattribution. Les supprimer aurait rendu illisibles les lignes d'audit
-- qui les citent.
--
-- ⚠️ TROIS COMPTES portent `secretaire_csst` et DEUX `correspondant_mgp` : ils perdent leur accès
-- dès l'application, jusqu'à ce qu'un des nouveaux rôles leur soit attribué. C'est le prix d'un
-- basculement en une fois, et c'est réversible.
--
-- Les permissions ci-dessous sont GÉNÉRÉES depuis `src/server/authz/roles.ts` : les recopier à la
-- main aurait fait diverger la base de la référence dès la première faute de frappe.

BEGIN;

-- Chargé de sécurité du site
INSERT INTO "roles" ("name", "guard_name", "libelle", "actif", "created_at", "updated_at")
VALUES ('charge_securite', 'web', 'Chargé de sécurité du site', TRUE, NOW(), NOW())
ON CONFLICT ("name", "guard_name") DO NOTHING;

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT p."id", r."id" FROM "permissions" p, "roles" r
WHERE r."name" = 'charge_securite' AND r."guard_name" = 'web'
  AND p."guard_name" = 'web' AND p."name" IN ('dossiers.view', 'dossiers.status.update', 'dossiers.close', 'dossiers.reopen', 'investigations.view', 'investigations.create', 'investigations.update', 'actions.view', 'actions.create', 'actions.update', 'actions.verify_efficacite', 'actions.close', 'messagerie.view', 'messagerie.send')
ON CONFLICT DO NOTHING;

-- Correspondant DRH — griefs employés
INSERT INTO "roles" ("name", "guard_name", "libelle", "actif", "created_at", "updated_at")
VALUES ('correspondant_drh', 'web', 'Correspondant DRH — griefs employés', TRUE, NOW(), NOW())
ON CONFLICT ("name", "guard_name") DO NOTHING;

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT p."id", r."id" FROM "permissions" p, "roles" r
WHERE r."name" = 'correspondant_drh' AND r."guard_name" = 'web'
  AND p."guard_name" = 'web' AND p."name" IN ('dossiers.view', 'dossiers.status.update', 'investigations.view', 'investigations.create', 'investigations.update', 'actions.view', 'actions.create', 'actions.update', 'messagerie.view', 'messagerie.send')
ON CONFLICT DO NOTHING;

-- Correspondant DADD — griefs communautaires
INSERT INTO "roles" ("name", "guard_name", "libelle", "actif", "created_at", "updated_at")
VALUES ('correspondant_dadd', 'web', 'Correspondant DADD — griefs communautaires', TRUE, NOW(), NOW())
ON CONFLICT ("name", "guard_name") DO NOTHING;

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT p."id", r."id" FROM "permissions" p, "roles" r
WHERE r."name" = 'correspondant_dadd' AND r."guard_name" = 'web'
  AND p."guard_name" = 'web' AND p."name" IN ('dossiers.view', 'dossiers.status.update', 'investigations.view', 'investigations.create', 'investigations.update', 'actions.view', 'actions.create', 'actions.update', 'messagerie.view', 'messagerie.send')
ON CONFLICT DO NOTHING;

-- Correspondant DL — griefs sous-traitants
INSERT INTO "roles" ("name", "guard_name", "libelle", "actif", "created_at", "updated_at")
VALUES ('correspondant_dl', 'web', 'Correspondant DL — griefs sous-traitants', TRUE, NOW(), NOW())
ON CONFLICT ("name", "guard_name") DO NOTHING;

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT p."id", r."id" FROM "permissions" p, "roles" r
WHERE r."name" = 'correspondant_dl' AND r."guard_name" = 'web'
  AND p."guard_name" = 'web' AND p."name" IN ('dossiers.view', 'dossiers.status.update', 'investigations.view', 'investigations.create', 'investigations.update', 'actions.view', 'actions.create', 'actions.update', 'messagerie.view', 'messagerie.send')
ON CONFLICT DO NOTHING;

-- Responsable MGP de structure
INSERT INTO "roles" ("name", "guard_name", "libelle", "actif", "created_at", "updated_at")
VALUES ('responsable_mgp_structure', 'web', 'Responsable MGP de structure', TRUE, NOW(), NOW())
ON CONFLICT ("name", "guard_name") DO NOTHING;

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT p."id", r."id" FROM "permissions" p, "roles" r
WHERE r."name" = 'responsable_mgp_structure' AND r."guard_name" = 'web'
  AND p."guard_name" = 'web' AND p."name" IN ('dossiers.view', 'dossiers.status.update', 'investigations.view', 'investigations.validate', 'actions.view', 'actions.create', 'actions.update', 'messagerie.view', 'messagerie.send')
ON CONFLICT DO NOTHING;

UPDATE "roles" SET "actif" = FALSE, "updated_at" = NOW()
WHERE "guard_name" = 'web' AND "name" IN ('secretaire_csst', 'rqse', 'correspondant_mgp');

COMMIT;
