-- Familles de risque, attribuées à chaque déclaration pendant son traitement.
--
-- ⚠️ ADDITIVE : une table créée, une colonne NULLABLE ajoutée. Rien n'est supprimé, aucune ligne
-- existante n'est modifiée.
--
-- La catégorie dit DE QUOI parle la déclaration, au moment du dépôt et dans les mots du
-- déclarant. La famille de risque dit à quoi elle se rattache une fois instruite — c'est une
-- lecture de traitant, posée après analyse. Les deux coexistent : confondre les deux reviendrait
-- à demander au déclarant de qualifier son propre signalement.
--
-- ⚠️ `famille_risque_id` EST NULLABLE, et le restera. Les déclarations déjà déposées n'en ont
-- pas, et une déclaration qui vient d'arriver non plus : la famille se pose pendant le
-- traitement, pas à la création. La rendre obligatoire bloquerait le dépôt.

BEGIN;

CREATE TABLE IF NOT EXISTS "familles_risque" (
  "id"         BIGSERIAL PRIMARY KEY,
  "code"       VARCHAR(64)  NOT NULL,
  "libelle"    VARCHAR(255) NOT NULL,
  "ordre"      INTEGER      NOT NULL DEFAULT 0,
  "actif"      BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(0),
  "updated_at" TIMESTAMP(0),
  CONSTRAINT "familles_risque_code_unique" UNIQUE ("code")
);

COMMENT ON TABLE "familles_risque" IS
  'Familles de risque posées pendant le traitement d''une déclaration. Référentiel administrable.';

COMMENT ON COLUMN "familles_risque"."actif" IS
  'Désactivée : plus proposée au traitement, mais les dossiers qui la portent la gardent.';

ALTER TABLE "dossiers"
  ADD COLUMN IF NOT EXISTS "famille_risque_id" BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dossiers_famille_risque_id_foreign'
  ) THEN
    ALTER TABLE "dossiers"
      ADD CONSTRAINT "dossiers_famille_risque_id_foreign"
      FOREIGN KEY ("famille_risque_id") REFERENCES "familles_risque" ("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "dossiers_famille_risque_id_index"
  ON "dossiers" ("famille_risque_id");

COMMENT ON COLUMN "dossiers"."famille_risque_id" IS
  'Famille de risque posée au traitement. NULL tant qu''aucun traitant ne l''a qualifiée.';

/*
  ⚠️ UN POINT DE DÉPART, PAS UNE NOMENCLATURE ARRÊTÉE.

  Ces neuf familles couvrent ce que les quatre types de déclaration font remonter — évènements
  indésirables, griefs employés, sous-traitants et riverains. Elles sont administrables : le
  métier les renomme, en ajoute, en désactive.

  `ON CONFLICT DO NOTHING` rend l'évolution rejouable et n'écrase jamais un libellé retouché.
*/
INSERT INTO "familles_risque" ("code", "libelle", "ordre", "actif", "created_at", "updated_at")
VALUES
  ('securite_sante',        'Sécurité et santé au travail',          1, TRUE, NOW(), NOW()),
  ('conditions_travail',    'Conditions de travail et rémunération', 2, TRUE, NOW(), NOW()),
  ('discrimination',        'Discrimination et harcèlement',         3, TRUE, NOW(), NOW()),
  ('environnement',         'Environnement et nuisances',            4, TRUE, NOW(), NOW()),
  ('foncier',               'Foncier et déplacement',                5, TRUE, NOW(), NOW()),
  ('relations_communautes', 'Relations avec les communautés',        6, TRUE, NOW(), NOW()),
  ('atteinte_biens',        'Atteinte aux biens',                    7, TRUE, NOW(), NOW()),
  ('integrite',             'Corruption et fraude',                  8, TRUE, NOW(), NOW()),
  ('autre',                 'Autre',                                 9, TRUE, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

COMMIT;
