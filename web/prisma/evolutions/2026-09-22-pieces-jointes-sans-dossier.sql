-- Retirer les lignes `pieces_jointes` dont le dossier parent n'existe plus.
--
-- ⚠️ DEUX ORPHELINAGES DIFFÉRENTS, ET IL FAUT LES DISTINGUER :
--
--   1. UN FICHIER sans ligne — résidu d'une transaction annulée après l'écriture des fichiers.
--      C'est le seul cas qui peut se produire EN PRODUCTION, et il est traité par la tâche
--      `ramasser-fichiers-orphelins` (`stockage/ramasse-miettes.ts`).
--
--   2. UNE LIGNE sans dossier — ce que ce fichier corrige. Elle suppose qu'un dossier ait été
--      SUPPRIMÉ, ce que RG-03 interdit et que l'application n'offre nulle part. Les 17 lignes
--      concernées viennent donc toutes du nettoyage de données d'essai, qui effaçait les dossiers
--      sans leurs pièces.
--
-- ⚠️ LA CAUSE EST CORRIGÉE AILLEURS, et c'est ce qui rend cette purge définitive :
-- `nettoyerDossiers()` emporte désormais les pièces ET leurs fichiers. Sans cette correction,
-- la prochaine exécution de la suite en aurait recréé.
--
-- ⚠️ CE FICHIER NE TOUCHE PAS AU MAGASIN. Les fichiers correspondants deviennent, eux, des
-- orphelins du premier type — et c'est délibéré : ils seront ramassés par la tâche
-- hebdomadaire, qui sait vérifier leur âge, plutôt que par une suppression en masse écrite à la
-- main dans un fichier SQL qui ne peut pas les voir.

BEGIN;

-- Les trois types de parent possibles sont vérifiés, pas seulement `dossiers` : une pièce
-- attachée à une investigation ou à une action corrective est légitime (voir la résolution dans
-- `api/pieces-jointes/[id]/route.ts`), et la supprimer détruirait une pièce jointe valide.
DELETE FROM "pieces_jointes" p
WHERE NOT EXISTS (SELECT 1 FROM "dossiers" d WHERE d.id = p.attachable_id)
  AND NOT EXISTS (SELECT 1 FROM "investigations" i WHERE i.id = p.attachable_id)
  AND NOT EXISTS (SELECT 1 FROM "actions_correctives" a WHERE a.id = p.attachable_id);

COMMIT;
