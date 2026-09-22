-- Une famille de risque est rattachée à un TYPE DE DÉCLARATION.
--
-- ⚠️ ADDITIVE : une colonne nullable et sa clé étrangère. Aucune ligne n'est modifiée, aucun
-- dossier ne perd sa qualification.
--
-- Les neuf familles livrées sont communes aux quatre types : elles ont été semées avant que le
-- rattachement n'existe, et trois dossiers en portent une. Les répartir d'office reviendrait à
-- décider à la place du métier lesquelles relèvent du grief employé, du sous-traitant ou de la
-- communauté — une décision que rien dans la base ne permet de déduire, et qui retirerait des
-- choix aux traitants sans que personne ne l'ait demandé.
--
-- ⚠️ `NULL` VEUT DIRE « TOUS LES TYPES », et ce n'est pas un défaut de conception : « Autre » ou
-- « Corruption et fraude » relèvent réellement des quatre. Les dupliquer quatre fois pour honorer
-- un rattachement obligatoire aurait fait passer le référentiel de neuf lignes à trente-six, et
-- rendu chaque renommage quadruple — l'inverse de l'affichage resserré qui est demandé.
--
-- Les neuf restent donc sur « Tous les types » jusqu'à ce qu'un administrateur les répartisse
-- depuis l'écran, d'une liste déroulante. L'affichage se resserre au fur et à mesure.

BEGIN;

ALTER TABLE "familles_risque"
  ADD COLUMN IF NOT EXISTS "parcours_id" BIGINT NULL;

COMMENT ON COLUMN "familles_risque"."parcours_id" IS
  'Type de déclaration auquel cette famille est réservée. NULL = proposée sur tous les types.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'familles_risque_parcours_id_foreign'
  ) THEN
    ALTER TABLE "familles_risque"
      ADD CONSTRAINT "familles_risque_parcours_id_foreign"
      FOREIGN KEY ("parcours_id") REFERENCES "parcours" ("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "familles_risque_parcours_id_index"
  ON "familles_risque" ("parcours_id");

/*
  ⚠️ `ON DELETE SET NULL`, ET NON `CASCADE`.

  Supprimer un type de déclaration ne doit pas emporter ses familles de risque : les dossiers qui
  les portent survivraient à la suppression du type, et se retrouveraient à citer une famille
  effacée. La famille redevient « tous les types » — visible, corrigeable, jamais perdue.
*/

COMMIT;
