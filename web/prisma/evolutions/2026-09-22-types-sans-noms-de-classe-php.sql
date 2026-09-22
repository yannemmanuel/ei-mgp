-- Réécrire les colonnes de type polymorphe : noms de classe PHP → codes du dispositif.
--
-- ⚠️ CETTE MIGRATION ET LE CODE BASCULENT ENSEMBLE. Quatre colonnes portent le TYPE de l'objet
-- désigné par l'identifiant voisin, sans qu'aucune clé étrangère ne les contraigne. Le code les
-- lit par égalité stricte : si la base est réécrite sans le code, `model_has_roles` ne répond plus
-- et PLUS PERSONNE N'A DE RÔLE ; si le code est déployé sans la base, c'est l'inverse. Les deux
-- moitiés sont dans le même commit, et cette migration doit être appliquée au même moment.
--
-- ⚠️ POURQUOI CES CODES-LÀ, ET PAS D'AUTRES. Ils ne sont pas inventés : chacun reprend le préfixe
-- que la colonne `audit_logs.action` emploie DÉJÀ pour le même objet. Les deux colonnes d'une
-- même ligne se contredisaient — l'action disait `statut_dossier.modifie`, le type disait
-- `App\Models\StatutDossier` — et une seconde table de correspondance existait dans le code pour
-- les réconcilier à l'affichage. Elle a disparu avec cette migration.
--
-- ⚠️ `App\Models\User` DEVIENT `user`, ET NON `utilisateur`. Le reste du projet est en français,
-- mais cette valeur-ci est contrainte par les données déjà écrites : 73 lignes portent l'action
-- `user.cree` ou `user.modifie`, 61 autres `auth.connexion` sur le même objet. Franciser la
-- valeur rouvrirait précisément l'écart que cette migration ferme.
--
-- ⚠️ CE QUI N'EST PAS RÉÉCRIT : `pieces_jointes.chemin`. Le dossier de rangement d'une pièce
-- dérive du type de son parent, et les vingt pièces déjà déposées sont rangées sous
-- `pieces-jointes/App\Models\Dossier/…`. Leur chemin est stocké ligne par ligne et reste valide ;
-- les pièces nouvelles iront sous `pieces-jointes/dossier/…`. Déplacer des fichiers pour une
-- question de vocabulaire aurait mis en jeu les pièces elles-mêmes, pour aucun gain.
-- `normaliser()` (`stockage/magasin.ts`) continue donc de traiter les antislashs, et son
-- commentaire dit pourquoi.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Le journal d'audit — 330 lignes, dix-sept types distincts
-- ---------------------------------------------------------------------------------------------
--
-- ⚠️ EN AJOUT SEUL (CDC §15), ET CETTE MIGRATION EST LA SEULE EXCEPTION. Elle ne change ni ce qui
-- s'est passé, ni quand, ni par qui : elle réécrit le VOCABULAIRE d'une colonne, pour que la
-- ligne reste lisible maintenant que la table de correspondance a disparu. Laisser ces valeurs en
-- place aurait rendu 330 lignes d'historique muettes à l'affichage — c'eût été les altérer
-- davantage que les traduire.

UPDATE "audit_logs" SET "auditable_type" = CASE "auditable_type"
  WHEN 'App\Models\ActionCorrective'     THEN 'action_corrective'
  WHEN 'App\Models\CanalCaptage'         THEN 'canal_captage'
  WHEN 'App\Models\Categorie'            THEN 'categorie'
  WHEN 'App\Models\Direction'            THEN 'direction'
  WHEN 'App\Models\Dossier'              THEN 'dossier'
  WHEN 'App\Models\DossierAffectation'   THEN 'dossier_affectation'
  WHEN 'App\Models\FamilleRisque'        THEN 'famille_risque'
  WHEN 'App\Models\Investigation'        THEN 'investigation'
  WHEN 'App\Models\Lieu'                 THEN 'lieu'
  WHEN 'App\Models\Message'              THEN 'message'
  WHEN 'App\Models\NiveauGravite'        THEN 'niveau_gravite'
  WHEN 'App\Models\NotificationTemplate' THEN 'notification_template'
  WHEN 'App\Models\Parcours'             THEN 'parcours'
  WHEN 'App\Models\PieceJointe'          THEN 'piece_jointe'
  WHEN 'App\Models\Poste'                THEN 'poste'
  WHEN 'App\Models\QrCode'               THEN 'qr_code'
  WHEN 'App\Models\Site'                 THEN 'site'
  WHEN 'App\Models\SlaDelai'             THEN 'sla_delai'
  WHEN 'App\Models\StatutDossier'        THEN 'statut_dossier'
  WHEN 'App\Models\TrancheAnciennete'    THEN 'tranche_anciennete'
  WHEN 'App\Models\User'                 THEN 'user'
  WHEN 'App\Models\Ville'                THEN 'ville'
  WHEN 'Spatie\Permission\Models\Role'   THEN 'role'
  ELSE "auditable_type"
END
WHERE "auditable_type" IS NOT NULL;

-- L'ancienne dérivation aplatissait les noms composés : `App\Models\TrancheAnciennete` donnait le
-- préfixe d'action `trancheanciennete`, là où le reste du journal écrit `tranche_anciennete`.
-- Deux lignes portent cette forme ; `libelles.ts` gardait une entrée exprès pour elles. L'émetteur
-- étant aligné, elles le sont aussi.
UPDATE "audit_logs"
SET "action" = 'tranche_anciennete' || substring("action" from 18)
WHERE "action" LIKE 'trancheanciennete.%';

-- ---------------------------------------------------------------------------------------------
-- Les trois autres colonnes polymorphes
-- ---------------------------------------------------------------------------------------------
--
-- ⚠️ `model_has_roles` EST LA PLUS SENSIBLE DES QUATRE : `chargerUtilisateurAutorise()` la lit à
-- chaque vérification d'autorisation, en filtrant sur `model_type`. Une valeur qui ne correspond
-- plus ne produit pas d'erreur — elle produit un compte sans aucun rôle, donc sans aucun accès,
-- et rien ne dit pourquoi. Douze lignes.

UPDATE "model_has_roles"       SET "model_type"      = 'user'    WHERE "model_type"      = 'App\Models\User';
UPDATE "model_has_permissions" SET "model_type"      = 'user'    WHERE "model_type"      = 'App\Models\User';
UPDATE "notifications"         SET "notifiable_type" = 'user'    WHERE "notifiable_type" = 'App\Models\User';
UPDATE "pieces_jointes"        SET "attachable_type" = 'dossier' WHERE "attachable_type" = 'App\Models\Dossier';

COMMIT;
