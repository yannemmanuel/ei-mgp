-- Les rôles ne sont plus décrits par le code : tout se paramètre depuis l'interface.
--
-- ⚠️ ADDITIVE : quatre colonnes et une table ajoutées, puis remplies à l'identique de ce que le
-- code décidait. Rien n'est supprimé, aucune ligne existante n'est modifiée.
--
-- Cinq connaissances vivaient encore dans `src/server/authz` et se référaient aux rôles par leur
-- NOM. Créer un rôle depuis l'interface donnait donc un rôle inerte sur tous ces points : il
-- n'était borné par aucun rattachement, n'était alerté d'aucun circuit accéléré, et ne pouvait
-- faire avancer aucun dossier. Rien ne le signalait.
--
-- ⚠️ UN CHANGEMENT DE DÉFAUT, ET IL EST VOLONTAIRE. Dans le code, une étape ABSENTE de la table
-- des acteurs signifiait « ouverte à tous ceux qui en ont le droit ». Cette nuance ne survivrait
-- pas en base : l'absence de ligne s'y lit comme une interdiction, et distinguer les deux
-- demanderait une table de plus dont personne ne comprendrait l'objet.
--
-- La reprise ci-dessous rend donc EXPLICITE ce qui était implicite : pour les étapes que le code
-- laissait ouvertes, tous les rôles qui portent `dossiers.status.update` reçoivent une ligne. Le
-- comportement est identique au jour de la bascule ; ce qui change, c'est qu'on le voit.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. Quatre comportements, jusqu'ici lus dans des noms de rôles
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "cloisonne_par_rattachement" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "alerte_circuit_critique"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "voit_seulement_ses_declarations" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "voit_identite_declarant"    BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN "roles"."cloisonne_par_rattachement" IS
  'Ses porteurs ne voient que les dossiers de leur site ou de leur direction. Remplace ROLES_CLOISONNES_PAR_SITE.';
COMMENT ON COLUMN "roles"."alerte_circuit_critique" IS
  'Alerté immédiatement quand une déclaration de son périmètre est qualifiée critique (RG-08).';
COMMENT ON COLUMN "roles"."voit_seulement_ses_declarations" IS
  'Ne voit que les déclarations qu''il a lui-même déposées, et jamais les anonymes (RG-06).';
COMMENT ON COLUMN "roles"."voit_identite_declarant" IS
  'Faux pour un accès « sans données nominatives » : il voit les dossiers, jamais qui a déclaré.';

UPDATE "roles" SET "cloisonne_par_rattachement" = TRUE, "updated_at" = NOW()
 WHERE "guard_name" = 'web' AND "name" IN (
   'secretaire_csst', 'rqse', 'rgp', 'captage_grief_communaute',
   'captage_grief_soustraitant', 'charge_securite', 'responsable_mgp_structure'
 );

UPDATE "roles" SET "alerte_circuit_critique" = TRUE, "updated_at" = NOW()
 WHERE "guard_name" = 'web' AND "name" IN (
   'rqse', 'secretaire_csst', 'correspondant_mgp', 'responsable_grief_employe',
   'captage_grief_soustraitant', 'service_mgp', 'dg'
 );

UPDATE "roles" SET "voit_seulement_ses_declarations" = TRUE, "updated_at" = NOW()
 WHERE "guard_name" = 'web' AND "name" = 'employe_declarant';

UPDATE "roles" SET "voit_identite_declarant" = FALSE, "updated_at" = NOW()
 WHERE "guard_name" = 'web' AND "name" = 'comite_ethique';

-- ---------------------------------------------------------------------------------------------
-- 2. Qui fait avancer un dossier, étape par étape et type par type
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "role_etapes" (
  "id"          BIGSERIAL PRIMARY KEY,
  "role_id"     BIGINT NOT NULL,
  "parcours_id" BIGINT NOT NULL,
  "statut_id"   BIGINT NOT NULL,
  "created_at"  TIMESTAMP(0),
  "updated_at"  TIMESTAMP(0),
  CONSTRAINT "role_etapes_role_id_foreign"
    FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE,
  CONSTRAINT "role_etapes_parcours_id_foreign"
    FOREIGN KEY ("parcours_id") REFERENCES "parcours" ("id") ON DELETE CASCADE,
  CONSTRAINT "role_etapes_statut_id_foreign"
    FOREIGN KEY ("statut_id") REFERENCES "statuts_dossier" ("id") ON DELETE CASCADE,
  CONSTRAINT "role_etapes_unique" UNIQUE ("role_id", "parcours_id", "statut_id")
);

CREATE INDEX IF NOT EXISTS "role_etapes_role_id_index" ON "role_etapes" ("role_id");

COMMENT ON TABLE "role_etapes" IS
  'Étape de DÉPART qu''un rôle peut franchir, par type de déclaration. Une ligne absente interdit.';

-- Les étapes que le code désignait nommément.
INSERT INTO "role_etapes" ("role_id", "parcours_id", "statut_id", "created_at", "updated_at")
SELECT r."id", p."id", s."id", NOW(), NOW()
  FROM (VALUES
    -- §6.1 — l'évènement indésirable revient au chargé de sécurité du site.
    ('ei_employe', 'recu',       'charge_securite'),
    ('ei_employe', 'recu',       'service_mgp'),
    ('ei_employe', 'affecte',    'charge_securite'),
    ('ei_employe', 'affecte',    'secretaire_csst'),
    ('ei_employe', 'affecte',    'rqse'),
    ('ei_employe', 'en_analyse', 'charge_securite'),
    ('ei_employe', 'en_analyse', 'secretaire_csst'),
    ('ei_employe', 'en_analyse', 'rqse'),
    ('ei_employe', 'reouvert',   'service_mgp'),
    ('ei_employe', 'reouvert',   'dg'),

    -- §6.2 — DRH · Correspondant DRH · Responsable MGP de structure.
    ('grief_employe', 'recu',             'service_mgp'),
    ('grief_employe', 'affecte',          'responsable_grief_employe'),
    ('grief_employe', 'affecte',          'correspondant_drh'),
    ('grief_employe', 'affecte',          'responsable_mgp_structure'),
    ('grief_employe', 'affecte',          'correspondant_mgp'),
    ('grief_employe', 'affecte',          'rqse'),
    ('grief_employe', 'en_analyse',       'responsable_grief_employe'),
    ('grief_employe', 'en_analyse',       'correspondant_drh'),
    ('grief_employe', 'en_analyse',       'responsable_mgp_structure'),
    ('grief_employe', 'en_analyse',       'correspondant_mgp'),
    ('grief_employe', 'en_analyse',       'rqse'),
    ('grief_employe', 'en_investigation', 'dg'),
    ('grief_employe', 'en_investigation', 'service_mgp'),
    ('grief_employe', 'reouvert',         'service_mgp'),
    ('grief_employe', 'reouvert',         'dg'),

    -- §6.3 — Correspondant DL · Responsable MGP de structure.
    ('grief_sous_traitant', 'recu',             'service_mgp'),
    ('grief_sous_traitant', 'affecte',          'correspondant_dl'),
    ('grief_sous_traitant', 'affecte',          'responsable_mgp_structure'),
    ('grief_sous_traitant', 'affecte',          'correspondant_mgp'),
    ('grief_sous_traitant', 'en_analyse',       'correspondant_dl'),
    ('grief_sous_traitant', 'en_analyse',       'responsable_mgp_structure'),
    ('grief_sous_traitant', 'en_analyse',       'correspondant_mgp'),
    ('grief_sous_traitant', 'en_investigation', 'correspondant_dl'),
    ('grief_sous_traitant', 'en_investigation', 'responsable_mgp_structure'),
    ('grief_sous_traitant', 'en_investigation', 'correspondant_mgp'),
    ('grief_sous_traitant', 'reouvert',         'service_mgp'),
    ('grief_sous_traitant', 'reouvert',         'dg'),

    -- §6.4 — Service MGP/DADD · Correspondant DADD · Responsable MGP de structure.
    ('grief_communaute', 'recu',       'service_mgp'),
    ('grief_communaute', 'affecte',    'service_mgp'),
    ('grief_communaute', 'affecte',    'correspondant_dadd'),
    ('grief_communaute', 'affecte',    'responsable_mgp_structure'),
    ('grief_communaute', 'affecte',    'correspondant_mgp'),
    ('grief_communaute', 'en_analyse', 'service_mgp'),
    ('grief_communaute', 'en_analyse', 'correspondant_dadd'),
    ('grief_communaute', 'en_analyse', 'responsable_mgp_structure'),
    ('grief_communaute', 'en_analyse', 'correspondant_mgp'),
    ('grief_communaute', 'reouvert',   'service_mgp'),
    ('grief_communaute', 'reouvert',   'dg')
  ) AS voulu(parcours_code, statut_code, role_name)
  JOIN "roles"           r ON r."name" = voulu.role_name AND r."guard_name" = 'web'
  JOIN "parcours"        p ON p."code" = voulu.parcours_code
  JOIN "statuts_dossier" s ON s."code" = voulu.statut_code
ON CONFLICT ("role_id", "parcours_id", "statut_id") DO NOTHING;

/*
  Les étapes que le code laissait OUVERTES à tous ceux qui en ont le droit.

  `en_attente_information` et `action_corrective_en_cours` sur les quatre types, plus
  `en_investigation` sur l'évènement indésirable et le grief communautaire : le CDC n'y désigne
  personne. Chaque rôle portant `dossiers.status.update` reçoit donc une ligne — le comportement
  est le même, il devient simplement lisible dans l'écran.
*/
INSERT INTO "role_etapes" ("role_id", "parcours_id", "statut_id", "created_at", "updated_at")
SELECT r."id", p."id", s."id", NOW(), NOW()
  FROM "roles" r
  CROSS JOIN "parcours" p
  CROSS JOIN "statuts_dossier" s
 WHERE r."guard_name" = 'web'
   AND EXISTS (
     SELECT 1 FROM "role_has_permissions" rhp
       JOIN "permissions" perm ON perm."id" = rhp."permission_id"
      WHERE rhp."role_id" = r."id" AND perm."name" = 'dossiers.status.update'
   )
   AND (
     s."code" IN ('en_attente_information', 'action_corrective_en_cours')
     OR (s."code" = 'en_investigation' AND p."code" IN ('ei_employe', 'grief_communaute'))
   )
ON CONFLICT ("role_id", "parcours_id", "statut_id") DO NOTHING;

COMMIT;
