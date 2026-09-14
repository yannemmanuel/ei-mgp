-- Rattachement du DÉCLARANT, distinct de celui de la personne concernée.
--
-- ⚠️ ADDITIVE : trois colonnes ajoutées, toutes NULLABLE. Rien de supprimé ni de réécrit.
--
-- Une déclaration est souvent déposée par un témoin ou un collègue. La case « Je suis la personne
-- concernée » le dit depuis peu, mais le dossier ne portait toujours qu'UN rattachement — celui
-- de la direction concernée par les faits. Quand le déclarant n'est pas la victime, on ignorait
-- donc d'où il parle : impossible de le recontacter par la bonne voie, ni de mesurer combien de
-- signalements viennent d'une direction voisine plutôt que de celle où l'évènement s'est produit.
--
-- ⚠️ `direction_id` NE CHANGE PAS DE SENS, et c'est la précaution qui compte ici. Elle reste la
-- direction CONCERNÉE — celle des faits — et c'est d'elle que découle le site, donc l'acheminement
-- vers le service compétent (`site_id`). Y ranger la direction du déclarant aurait fait partir un
-- signalement vers le site du témoin plutôt que vers celui de l'incident.
--
-- ⚠️ NULL, et pas une valeur par défaut. Trois situations mènent à NULL, et elles sont légitimes :
-- le déclarant EST la personne concernée (les champs ne sont alors pas demandés) ; la déclaration
-- est anonyme et le poste n'est pas collecté ; la déclaration est antérieure à ce champ. Aucune ne
-- doit se lire comme « sans direction ».

BEGIN;

ALTER TABLE "dossiers"
  ADD COLUMN IF NOT EXISTS "direction_declarant_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "poste_declarant" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "poste_declarant_precision" TEXT;

-- Même contrainte que `direction_id` : une direction citée par un dossier ne se supprime pas.
-- `NOT VALID` évite de revalider les 40 lignes existantes, toutes à NULL par construction.
ALTER TABLE "dossiers"
  ADD CONSTRAINT "dossiers_direction_declarant_id_foreign"
  FOREIGN KEY ("direction_declarant_id") REFERENCES "directions" ("id") NOT VALID;

CREATE INDEX IF NOT EXISTS "dossiers_direction_declarant_id_index"
  ON "dossiers" ("direction_declarant_id");

COMMENT ON COLUMN "dossiers"."direction_declarant_id" IS
  'Direction du DÉCLARANT, quand il n''est pas la personne concernée. NULL sinon. ⚠️ Ne détermine PAS le site : c''est `direction_id`, la direction concernée par les faits, qui l''établit.';

COMMENT ON COLUMN "dossiers"."poste_declarant" IS
  'Poste du déclarant, quand il n''est pas la personne concernée. Jamais collecté en anonymat.';

COMMENT ON COLUMN "dossiers"."poste_declarant_precision" IS
  'Poste du déclarant saisi à la main quand « Autre » est retenu. NULL sinon.';

COMMIT;
