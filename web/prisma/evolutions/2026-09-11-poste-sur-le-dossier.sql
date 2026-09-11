-- Le poste occupé rejoint le dossier, pour être collecté même en anonyme.
--
-- ⚠️ ADDITIVE. Aucune colonne supprimée, aucune donnée réécrite.
--
-- Pourquoi ce déplacement : le poste était rangé dans `declaration_identites.fonction`, table que
-- `creer-declaration.ts` ne crée PAS quand l'anonymat est coché (RG-06). Le retour métier demande
-- de pouvoir choisir la direction ET le poste en anonyme ; l'y laisser aurait donc produit un
-- champ demandé à l'écran puis perdu sans le moindre signal — exactement ce qui avait été évité
-- pour l'entreprise du sous-traitant et la ville du riverain.
--
-- `declaration_identites.fonction` est CONSERVÉE telle quelle : elle porte les postes des
-- déclarations déjà déposées, et reste la colonne du parcours Sous-traitant, où « Fonction »
-- désigne le métier exercé chez l'employeur et non un poste SODECI.
--
-- Le libellé est stocké, et non une clé étrangère vers `postes` : un référentiel renommé plus
-- tard ne doit pas réécrire rétroactivement ce que le déclarant a choisi ce jour-là.

BEGIN;

ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "poste" TEXT;

COMMENT ON COLUMN "dossiers"."poste" IS
  'Poste choisi dans le référentiel « postes », rattaché à la direction du dossier. Collecté même en anonyme.';

COMMIT;
