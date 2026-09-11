-- « Le déclarant est-il la victime ? »
--
-- ⚠️ ADDITIVE : une colonne ajoutée, NULLABLE, rien de réécrit ni de supprimé.
--
-- Une déclaration peut être déposée par un témoin, un collègue ou un relais pour le compte de
-- quelqu'un d'autre. Rien ne le disait jusqu'ici : le traitement ne pouvait pas savoir s'il
-- s'adressait à la personne concernée ou à un intermédiaire — ce qui change à qui l'on répond, et
-- ce que l'on peut dire sans divulguer la situation d'un tiers.
--
-- ⚠️ NULL, et pas FALSE, pour les 37 dossiers existants. La question ne leur a jamais été posée :
-- répondre « non » à leur place inventerait une donnée que personne n'a déclarée. Trois états à
-- distinguer — oui, non, jamais demandé — et seul NULL porte le troisième.
--
-- La colonne est sur `dossiers` et non sur `declaration_identites` : cette table n'est pas créée
-- pour une déclaration anonyme, et la question se pose justement aussi en anonyme. L'y ranger
-- aurait affiché le champ puis perdu la réponse sans le moindre signal.

BEGIN;

ALTER TABLE "dossiers"
  ADD COLUMN IF NOT EXISTS "declarant_est_victime" BOOLEAN;

COMMENT ON COLUMN "dossiers"."declarant_est_victime" IS
  'Le déclarant déclare-t-il pour lui-même ? NULL = question non posée (déclarations antérieures au 11/09/2026).';

COMMIT;
