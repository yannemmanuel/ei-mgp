-- Habilitation par parcours attribuée PERSONNE PAR PERSONNE.
--
-- ⚠️ ADDITIVE : une table créée, rien de supprimé ni de réécrit.
--
-- Jusqu'ici, le périmètre venait du seul RÔLE : tout compte portant `correspondant_mgp` voyait les
-- trois types de grief. Le métier en attend autre chose — un correspondant par type de grief, et
-- pas le même. Le rôle continue de dire CE QUE la personne sait faire ; cette table dit SUR QUOI.
--
-- Le périmètre effectif est l'INTERSECTION des deux : on ne peut pas attribuer à un RQSE un
-- parcours que son rôle n'ouvre pas, et une attribution sans rôle correspondant ne donne rien.
--
-- ⚠️ Aucune ligne n'est créée ici, et c'est délibéré. Un compte sans attribution ne voit aucun
-- dossier — c'est l'arbitrage retenu : « il doit être obligatoirement habilité sur un parcours
-- pour avoir accès ». Les rôles TRANSVERSES (Service MGP, Direction générale, Auditeur, DPO) ne
-- sont pas concernés : ils gardent leur vue d'ensemble, ce qui laisse toujours quelqu'un capable
-- de voir un dossier dont le parcours n'est attribué à personne.

BEGIN;

CREATE TABLE IF NOT EXISTS "utilisateur_parcours" (
  "id"          BIGSERIAL PRIMARY KEY,
  "user_id"     BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "parcours_id" BIGINT NOT NULL REFERENCES "parcours" ("id"),
  "created_at"  TIMESTAMP(0),
  "updated_at"  TIMESTAMP(0),
  CONSTRAINT "utilisateur_parcours_unique" UNIQUE ("user_id", "parcours_id")
);

CREATE INDEX IF NOT EXISTS "utilisateur_parcours_user_id_index"
  ON "utilisateur_parcours" ("user_id");

COMMENT ON TABLE "utilisateur_parcours" IS
  'Types de déclaration confiés à une personne. Le périmètre effectif est l''intersection avec ce que ses rôles ouvrent ; les rôles transverses n''en dépendent pas.';

-- `ON DELETE CASCADE` sur le compte : une attribution n'a aucun sens sans lui. Aucune cascade vers
-- `parcours`, en revanche — les quatre parcours sont fixés par le CDC et ne se suppriment pas.

COMMIT;
