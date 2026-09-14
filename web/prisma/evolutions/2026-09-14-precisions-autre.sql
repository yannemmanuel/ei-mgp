-- Saisie libre partout où « Autre » est proposé, et sauvetage du statut du plaignant.
--
-- ⚠️ ADDITIVE : trois colonnes ajoutées, une donnée RECOPIÉE. Rien n'est supprimé ni réécrit.
--
-- 1. « AUTRE » SANS PRÉCISION NE DIT RIEN.
--
--    Le poste offre « Autre » depuis le retour métier, et le statut du plaignant l'a toujours
--    offert. Dans les deux cas, la réponse s'arrêtait là : on savait que la personne n'entrait
--    dans aucune case, jamais dans laquelle elle se trouvait. La catégorie, elle, demandait déjà
--    sa précision (`categorie_autre_precision`) — ces colonnes étendent le même principe aux deux
--    autres listes.
--
-- 2. ⚠️ LE STATUT DU PLAIGNANT ÉTAIT PERDU EN ANONYME. C'est un défaut, pas un choix.
--
--    Le champ est OBLIGATOIRE et reste affiché quand l'anonymat est coché — il qualifie la
--    plainte, pas la personne. Mais il était marqué `identite`, donc rangé dans
--    `declaration_identites`, table qui n'est PAS créée pour une déclaration anonyme : la réponse
--    était demandée à l'écran puis jetée en silence. Cinq des six plaintes riveraines en base
--    n'ont aucun statut pour cette seule raison.
--
--    Le champ rejoint donc `dossiers`, comme l'entreprise du sous-traitant et la ville du
--    riverain, qui avaient déjà été déplacées pour ce motif exact.
--
--    ⚠️ La colonne `declaration_identites.statut_plaignant` N'EST PAS SUPPRIMÉE, et sa valeur est
--    RECOPIÉE plutôt que déplacée. Les plaintes identifiées déjà déposées continuent de la
--    porter ; la retirer ferait perdre ce qui a été correctement collecté pour corriger ce qui ne
--    l'était pas.

BEGIN;

ALTER TABLE "dossiers"
  ADD COLUMN IF NOT EXISTS "poste_precision" TEXT,
  ADD COLUMN IF NOT EXISTS "statut_plaignant" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "statut_plaignant_precision" TEXT;

COMMENT ON COLUMN "dossiers"."poste_precision" IS
  'Poste saisi à la main quand « Autre » est retenu. NULL sinon.';

COMMENT ON COLUMN "dossiers"."statut_plaignant" IS
  'Qualité du plaignant. Sur `dossiers` et non `declaration_identites` : la question est posée même en anonymat, et cette table n''est pas créée dans ce cas.';

COMMENT ON COLUMN "dossiers"."statut_plaignant_precision" IS
  'Qualité saisie à la main quand « autre » est retenu. NULL sinon.';

-- Reprise des valeurs déjà collectées, pour les seules plaintes identifiées qui en portent une.
-- `WHERE ... IS NULL` rend l'opération rejouable sans jamais écraser une saisie plus récente.
UPDATE "dossiers" d
   SET "statut_plaignant" = i."statut_plaignant"
  FROM "declaration_identites" i
 WHERE i."dossier_id" = d."id"
   AND i."statut_plaignant" IS NOT NULL
   AND d."statut_plaignant" IS NULL;

COMMIT;
