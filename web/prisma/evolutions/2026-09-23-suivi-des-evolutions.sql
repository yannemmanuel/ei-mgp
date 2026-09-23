-- Enregistrer ce qui a été appliqué, et où.
--
-- ⚠️ LE CONSTAT (O1 de l'audit du 2026-09-22). Le schéma évolue par les fichiers de
-- `prisma/evolutions/`, appliqués à la main puis récupérés par `prisma db pull`. La démarche est
-- délibérée et protège les données — c'est la bonne décision face à `prisma migrate`, qui propose
-- d'effacer. Mais RIEN N'ENREGISTRAIT CE QUI ÉTAIT PASSÉ OÙ.
--
-- Vingt-sept évolutions existent aujourd'hui. Un déploiement devait les rejouer dans l'ordre, sans
-- aucun moyen automatique de savoir lesquelles étaient déjà passées — un exercice de mémoire, sur
-- une base portant des déclarations réelles.
--
-- ⚠️ L'EMPREINTE N'EST PAS DÉCORATIVE. Elle répond à la question qu'un simple nom de fichier ne
-- peut pas trancher : « ce fichier a-t-il changé depuis qu'on l'a appliqué ? » Une évolution
-- retouchée après coup produit une base qui ne correspond plus à son propre historique, et
-- personne ne s'en aperçoit — jusqu'au jour où l'on recrée un environnement et qu'il diffère.
-- `appliquer-evolutions.mts` REFUSE de continuer dans ce cas.
--
-- ⚠️ CETTE TABLE EST HORS DU MODÈLE MÉTIER, et le restera. Elle n'est lue par aucune page, aucun
-- service : seul le script d'application la consulte. La sortir de `schema.prisma` n'aurait rien
-- simplifié — `db pull` la récupérerait de toute façon — mais lui donner un service aurait fait
-- d'un outil d'exploitation une dépendance de l'application.

BEGIN;

CREATE TABLE IF NOT EXISTS "evolutions_appliquees" (
  -- Le nom de fichier, tel qu'il figure dans `prisma/evolutions/`. C'est la clé : renommer une
  -- évolution déjà appliquée la ferait rejouer, d'où l'interdiction, écrite dans le script.
  "fichier"      VARCHAR(255) NOT NULL PRIMARY KEY,
  -- SHA-256 du contenu au moment de l'application.
  "empreinte"    CHAR(64)     NOT NULL,
  "applique_le"  TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Ordre d'application réel, croissant. ⚠️ PAS l'ordre alphabétique : celui-ci ment.
  -- `2026-09-21-alerte-circuit-par-type.sql` se trie AVANT
  -- `2026-09-21-roles-entierement-parametrables.sql` alors qu'il supprime une colonne que le
  -- second crée. Rejouées dans l'ordre des noms, ces deux-là produisent une base où
  -- `roles.alerte_circuit_critique` SUBSISTE — ce qu'aucune production ne montre.
  "rang"         INTEGER      NOT NULL
);

COMMENT ON TABLE "evolutions_appliquees" IS
  'Quelles évolutions SQL ont été appliquées à CETTE base, dans quel ordre, et sur quel contenu.';

CREATE UNIQUE INDEX IF NOT EXISTS "evolutions_appliquees_rang_unique"
  ON "evolutions_appliquees" ("rang");

COMMIT;
