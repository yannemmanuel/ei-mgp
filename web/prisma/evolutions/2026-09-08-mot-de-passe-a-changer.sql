-- Mot de passe à changer à la première connexion.
--
-- Ce n'est pas « la première connexion » que la colonne enregistre, mais un fait plus précis et
-- plus utile : **le mot de passe a été choisi par quelqu'un d'autre**. Un administrateur crée un
-- compte, lit la valeur générée une fois, la transmet — elle est donc connue d'un tiers tant que
-- son porteur ne l'a pas remplacée. Le même raisonnement vaut après une régénération, qui n'est
-- pas une première connexion mais appelle exactement la même correction.
--
-- Purement ADDITIVE : une colonne avec valeur par défaut, réversible par un DROP COLUMN.
--
-- Le défaut est FAUX pour les lignes existantes, à dessein. Le passer à vrai obligerait les huit
-- comptes en service à changer leur mot de passe au prochain accès, ce qui n'est pas une décision
-- de migration mais d'exploitation : la commande est donnée en commentaire ci-dessous, à jouer en
-- connaissance de cause.
--
--   UPDATE "users" SET "doit_changer_mot_de_passe" = TRUE WHERE "actif";

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "doit_changer_mot_de_passe" BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
