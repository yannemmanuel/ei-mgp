-- Le responsable d'une action corrective se saisit à la main.
--
-- ⚠️ ADDITIVE : une colonne ajoutée, une contrainte RELÂCHÉE, une donnée RECOPIÉE. Rien n'est
-- supprimé, et la colonne d'origine garde ce qu'elle porte.
--
-- Le responsable était choisi dans la liste des comptes — il fallait donc en avoir un. Or celui
-- qui met en œuvre une mesure n'est pas toujours un utilisateur de la plateforme : un chef
-- d'équipe, un prestataire, un service entier. La contrainte revenait à ne pouvoir confier une
-- action qu'aux personnes déjà connues du système, c'est-à-dire rarement à celle qui agit.
--
-- ⚠️ `responsable_id` DEVIENT NULLABLE plutôt que d'être supprimée. Trois actions la renseignent
-- déjà ; l'effacer perdrait le lien vers le compte qui en répond, et avec lui la possibilité de
-- retrouver ses actions. Elle reste renseignable, simplement plus obligatoire.
--
-- ⚠️ Le nom est RECOPIÉ depuis le compte pour les lignes existantes. Sans cela, elles
-- afficheraient un responsable vide dès que l'écran cesserait de lire la relation — une
-- information présente en base, devenue invisible par un changement d'affichage.

BEGIN;

ALTER TABLE "actions_correctives"
  ADD COLUMN IF NOT EXISTS "responsable_nom" VARCHAR(255);

ALTER TABLE "actions_correctives"
  ALTER COLUMN "responsable_id" DROP NOT NULL;

COMMENT ON COLUMN "actions_correctives"."responsable_nom" IS
  'Responsable saisi à la main : il n''a pas forcément de compte sur la plateforme.';

COMMENT ON COLUMN "actions_correctives"."responsable_id" IS
  'Compte responsable, quand il en existe un. Hérité du choix dans une liste ; la saisie se fait désormais par `responsable_nom`.';

-- Reprise du nom pour les lignes qui pointent vers un compte. `WHERE ... IS NULL` rend
-- l'opération rejouable sans jamais écraser une saisie plus récente.
UPDATE "actions_correctives" a
   SET "responsable_nom" = u."name"
  FROM "users" u
 WHERE u."id" = a."responsable_id"
   AND a."responsable_nom" IS NULL;

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- Une investigation n'est plus soumise à validation.
-- ---------------------------------------------------------------------------------------------
--
-- ⚠️ CETTE PARTIE ÉCRIT dans `investigations.statut`. Ce n'est pas une commodité : deux fiches
-- sont arrêtées à « en_attente_validation », c'est-à-dire en attente d'un geste qui n'existera
-- plus. Sans cette reprise, elles resteraient indéfiniment dans un état que plus aucun écran ni
-- aucun service ne sait faire avancer.
--
-- ⚠️ Les colonnes `valide_par` et `valide_le` ne sont PAS touchées, ni supprimées. Elles portent
-- le fait historique — qui a validé, et quand. `statut` ne portait qu'une étape de workflow ; le
-- fait, lui, reste inscrit là où il a toujours été.

BEGIN;

UPDATE "investigations"
   SET "statut" = 'en_cours',
       "updated_at" = COALESCE("updated_at", NOW())
 WHERE "statut" <> 'en_cours';

COMMENT ON COLUMN "investigations"."statut" IS
  'Vestige du workflow de validation, supprimé le 2026-09-18. Valeur unique : en_cours.';

COMMENT ON COLUMN "investigations"."valide_par" IS
  'Trace historique : qui avait validé la fiche avant la suppression de l''étape de validation.';

COMMIT;
