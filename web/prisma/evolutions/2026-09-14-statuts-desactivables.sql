-- Désactivation d'un statut de dossier.
--
-- ⚠️ ADDITIVE : une colonne ajoutée, avec un défaut qui laisse les dix statuts actifs. Rien de
-- supprimé, aucun comportement existant modifié pour qui n'y touche pas.
--
-- Les autres référentiels se désactivent depuis toujours ; celui-ci ne le pouvait pas. Le métier
-- le demande, et la colonne lui donne un sens PRÉCIS, sans lequel elle ne serait qu'un drapeau
-- que rien ne lit :
--
--   • un statut désactivé n'est plus PROPOSÉ comme destination d'une transition manuelle ;
--   • les dossiers qui s'y trouvent déjà y restent, et l'affichent normalement.
--
-- C'est la même sémantique que partout ailleurs : on retire une valeur du choix futur sans
-- réécrire le passé. Un statut désactivé n'est pas un statut supprimé — c'est un état qu'on cesse
-- de faire atteindre.
--
-- ⚠️ La création d'une déclaration ne consulte PAS ce drapeau. `creerDeclaration()` cherche
-- « recu » par son code et l'attribue quoi qu'il arrive : désactiver ce statut-là n'empêche donc
-- aucun dépôt. C'est volontaire — le premier état d'un dossier n'est pas un choix qu'on lui
-- propose, c'est celui où il naît.

BEGIN;

ALTER TABLE "statuts_dossier"
  ADD COLUMN IF NOT EXISTS "actif" BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN "statuts_dossier"."actif" IS
  'Faux = plus proposé comme destination d''une transition manuelle. Les dossiers déjà dans cet état y restent.';

COMMIT;
