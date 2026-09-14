-- Lien de première connexion à usage unique.
--
-- ⚠️ ADDITIVE : une table créée, rien de supprimé ni de réécrit.
--
-- Le compte créé recevait son mot de passe par e-mail. Il transitait donc en clair dans un canal
-- que l'application ne maîtrise pas, et y restait aussi longtemps que le message — dans une boîte
-- de réception, sur un serveur relais, dans une sauvegarde. Le lien le remplace : il ne donne
-- accès à rien par lui-même, il ouvre UNE fois un écran où la personne choisit un mot de passe que
-- personne d'autre n'aura connu.
--
-- ⚠️ `token_hash` et non le jeton. Une empreinte SHA-256, pas un bcrypt — et c'est délibéré :
-- bcrypt est lent PAR CONCEPTION pour résister à l'attaque d'un secret devinable, ce qu'un mot de
-- passe humain est et qu'un tirage de 32 octets n'est pas. Son sel aléatoire rend surtout la
-- valeur non reproductible, donc impossible à retrouver par index : il faudrait parcourir la
-- table entière à chaque tentative. SHA-256 est déterministe, se cherche par index unique, et une
-- base volée ne livre aucun lien exploitable.
--
-- ⚠️ La ligne SURVIT à son usage : `utilise_le` est horodaté au lieu que la ligne soit supprimée.
-- Un lien déjà consommé peut ainsi se distinguer d'un lien inconnu — « ce lien a déjà servi » se
-- comprend et s'explique, « lien invalide » envoie appeler l'administration pour rien. C'est aussi
-- la trace de qui a pris possession du compte, et quand.

BEGIN;

CREATE TABLE IF NOT EXISTS "invitations_connexion" (
  "id"         BIGSERIAL PRIMARY KEY,
  "user_id"    BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "token_hash" VARCHAR(64) NOT NULL,
  "expire_le"  TIMESTAMP(0) NOT NULL,
  "utilise_le" TIMESTAMP(0),
  "created_at" TIMESTAMP(0),
  "updated_at" TIMESTAMP(0),
  CONSTRAINT "invitations_connexion_token_hash_unique" UNIQUE ("token_hash")
);

CREATE INDEX IF NOT EXISTS "invitations_connexion_user_id_index"
  ON "invitations_connexion" ("user_id");

COMMENT ON TABLE "invitations_connexion" IS
  'Liens de première connexion à usage unique. Le jeton n''est jamais stocké : seule son empreinte SHA-256 l''est.';

COMMENT ON COLUMN "invitations_connexion"."utilise_le" IS
  'Horodatage de consommation. NULL = jamais utilisé. La ligne est conservée après usage pour distinguer un lien consommé d''un lien inconnu.';

-- `ON DELETE CASCADE` sur le compte : une invitation n'a aucun sens sans lui.

COMMIT;
