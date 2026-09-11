-- Retour métier du 11/09/2026 sur les formulaires de déclaration.
--
-- ⚠️ ENTIÈREMENT NON DESTRUCTIVE. Aucune colonne n'est supprimée, aucune donnée n'est effacée,
-- aucune valeur existante n'est réécrite. Les champs retirés des ÉCRANS gardent leur colonne :
-- vingt-trois dossiers les renseignent déjà, et l'historique doit rester lisible. On cesse de
-- collecter, on ne détruit pas.
--
-- Appliquée à la main plutôt que par `prisma migrate` : la base ne connaît aucun historique de
-- migration Prisma (elle vient de Laravel), et lancer `migrate` sur une base non initialisée
-- proposerait de la réinitialiser. `prisma db pull` réintrospecte ensuite le schéma.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La gravité n'est plus saisie à la déclaration d'un évènement indésirable.
-- ---------------------------------------------------------------------------
-- Elle sera qualifiée au TRAITEMENT (EI8). La colonne reste, la contrainte NOT NULL doit partir :
-- un dossier EI naît désormais sans gravité. C'est un ASSOUPLISSEMENT — toutes les lignes
-- existantes restent valides, et la clé étrangère est conservée.
--
-- ⚠️ Conséquence sur RG-08 : le circuit accéléré se déclenchait à la création, d'après la gravité
-- saisie par le déclarant. Il se déclenche désormais au moment où la gravité est qualifiée.
ALTER TABLE "dossiers" ALTER COLUMN "niveau_gravite_id" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Plus aucune limite de caractères sur les champs de texte libre (G1).
-- ---------------------------------------------------------------------------
-- VARCHAR(255) → TEXT. En PostgreSQL, cet élargissement ne réécrit pas la table et ne peut
-- tronquer aucune valeur : toute chaîne acceptée hier l'est encore.
ALTER TABLE "dossiers"
  ALTER COLUMN "attentes_declarant" TYPE TEXT,
  ALTER COLUMN "lieu" TYPE TEXT,
  ALTER COLUMN "categorie_autre_precision" TYPE TEXT;

ALTER TABLE "declaration_identites"
  ALTER COLUMN "fonction" TYPE TEXT,
  ALTER COLUMN "localite" TYPE TEXT;

-- ---------------------------------------------------------------------------
-- 3. Localisation du parcours Communauté (GR1, GR2).
-- ---------------------------------------------------------------------------
-- La ville est OBLIGATOIRE, y compris pour une déclaration anonyme. Elle ne peut donc pas vivre
-- dans `declaration_identites`, qui n'est tout simplement pas créée quand l'anonymat est coché :
-- une ville exigée mais non stockée n'aurait servi à personne. Elle rejoint `dossiers`, comme la
-- direction l'avait fait pour la même raison.
--
-- Le libellé est stocké, et non une clé étrangère vers `villes` : un référentiel renommé plus
-- tard ne doit pas réécrire rétroactivement ce que le déclarant a choisi ce jour-là.
ALTER TABLE "dossiers"
  ADD COLUMN IF NOT EXISTS "ville" TEXT,
  ADD COLUMN IF NOT EXISTS "precision_localisation" TEXT;

COMMENT ON COLUMN "dossiers"."ville" IS
  'Parcours Communauté — ville choisie dans le référentiel « villes », conservée en clair.';
COMMENT ON COLUMN "dossiers"."precision_localisation" IS
  'Complément libre de localisation : quartier, campement, point de repère.';

-- ---------------------------------------------------------------------------
-- 3 bis. Entreprise sous-traitante, y compris en anonyme (GST2).
-- ---------------------------------------------------------------------------
-- Même raisonnement que la ville, et pour la même raison : `declaration_identites` n'est PAS
-- créée quand l'anonymat est coché — `creer-declaration.ts` l'ignore explicitement (RG-06). Une
-- entreprise exigée à l'écran mais rangée là serait donc perdue à chaque déclaration anonyme,
-- silencieusement.
--
-- L'anonymat protège LA PERSONNE, pas l'entreprise pour laquelle elle travaille : cette donnée
-- n'identifie personne à elle seule et rejoint `dossiers`, comme la direction avant elle.
-- `declaration_identites.entreprise` est conservée telle quelle pour l'historique.
ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "entreprise" TEXT;

COMMENT ON COLUMN "dossiers"."entreprise" IS
  'Parcours Sous-traitant — entreprise, collectée même en anonyme.';

-- ---------------------------------------------------------------------------
-- 4. Ancienneté par tranche (GE1).
-- ---------------------------------------------------------------------------
-- `anciennete_annees` (SMALLINT) est CONSERVÉE : elle porte l'ancienneté des griefs déjà déposés.
-- La tranche est une donnée distincte, stockée en clair pour la même raison que la ville.
ALTER TABLE "declaration_identites"
  ADD COLUMN IF NOT EXISTS "anciennete_tranche" TEXT;

COMMENT ON COLUMN "declaration_identites"."anciennete_tranche" IS
  'Tranche choisie dans le référentiel « tranches_anciennete ». Remplace anciennete_annees, qui reste pour l''historique.';

-- ---------------------------------------------------------------------------
-- 5. Nouveaux référentiels (ADM2 à ADM5).
-- ---------------------------------------------------------------------------
-- Tous portent `actif` : une valeur retirée de l'usage se DÉSACTIVE et ne se supprime pas, sans
-- quoi les déclarations déjà enregistrées perdraient le sens de ce qui y a été choisi.

-- ADM2 — Postes, rattachés à une direction (cascade Direction → Poste du formulaire EI).
CREATE TABLE IF NOT EXISTS "postes" (
  "id"           BIGSERIAL PRIMARY KEY,
  "direction_id" BIGINT       NOT NULL REFERENCES "directions" ("id"),
  "libelle"      VARCHAR(255) NOT NULL,
  "ordre"        INTEGER      NOT NULL DEFAULT 1,
  "actif"        BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at"   TIMESTAMP(0),
  "updated_at"   TIMESTAMP(0),
  CONSTRAINT "postes_direction_libelle_unique" UNIQUE ("direction_id", "libelle")
);

CREATE INDEX IF NOT EXISTS "postes_direction_id_index" ON "postes" ("direction_id");

-- ADM3 — Lieux (champ Lieu du formulaire EI).
CREATE TABLE IF NOT EXISTS "lieux" (
  "id"         BIGSERIAL PRIMARY KEY,
  "libelle"    VARCHAR(255) NOT NULL,
  "ordre"      INTEGER      NOT NULL DEFAULT 1,
  "actif"      BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(0),
  "updated_at" TIMESTAMP(0),
  CONSTRAINT "lieux_libelle_unique" UNIQUE ("libelle")
);

-- ADM4 — Villes (champ Ville du formulaire Communauté).
CREATE TABLE IF NOT EXISTS "villes" (
  "id"         BIGSERIAL PRIMARY KEY,
  "libelle"    VARCHAR(255) NOT NULL,
  "ordre"      INTEGER      NOT NULL DEFAULT 1,
  "actif"      BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(0),
  "updated_at" TIMESTAMP(0),
  CONSTRAINT "villes_libelle_unique" UNIQUE ("libelle")
);

-- ADM5 — Tranches d'ancienneté (champ Ancienneté du grief employé).
CREATE TABLE IF NOT EXISTS "tranches_anciennete" (
  "id"         BIGSERIAL PRIMARY KEY,
  "libelle"    VARCHAR(255) NOT NULL,
  "ordre"      INTEGER      NOT NULL DEFAULT 1,
  "actif"      BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(0),
  "updated_at" TIMESTAMP(0),
  CONSTRAINT "tranches_anciennete_libelle_unique" UNIQUE ("libelle")
);

-- Valeurs par défaut proposées par le métier, à confirmer. `ON CONFLICT DO NOTHING` : rejouer ce
-- fichier ne crée aucun doublon et n'écrase aucun libellé ajusté depuis.
INSERT INTO "tranches_anciennete" ("libelle", "ordre", "created_at", "updated_at") VALUES
  ('Moins d''1 an', 1, NOW(), NOW()),
  ('1 à 3 ans',     2, NOW(), NOW()),
  ('3 à 5 ans',     3, NOW(), NOW()),
  ('5 à 10 ans',    4, NOW(), NOW()),
  ('Plus de 10 ans', 5, NOW(), NOW())
ON CONFLICT ("libelle") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Amorçage des référentiels DEPUIS L'EXISTANT.
-- ---------------------------------------------------------------------------
-- Lieu et ville deviennent des listes déroulantes OBLIGATOIRES. Livrées vides, elles rendraient
-- les deux formulaires concernés impossibles à envoyer — un champ requis dont la liste ne
-- propose rien ne se remplit pas.
--
-- Rien n'est inventé pour autant : les valeurs sont tirées de ce que la base contient déjà,
-- c'est-à-dire de ce que des déclarants ont réellement saisi et de sites réellement configurés.
-- Ces listes restent à compléter en administration ; elles sont amorcées, pas arrêtées.

-- Lieux : ceux déjà employés dans les déclarations, et les sites configurés.
-- Le filtre de longueur écarte les saisies d'essai d'un caractère, sans juger du reste.
INSERT INTO "lieux" ("libelle", "ordre", "created_at", "updated_at")
SELECT DISTINCT TRIM("lieu"), 1, NOW(), NOW()
FROM "dossiers"
WHERE "lieu" IS NOT NULL AND LENGTH(TRIM("lieu")) >= 3
ON CONFLICT ("libelle") DO NOTHING;

INSERT INTO "lieux" ("libelle", "ordre", "created_at", "updated_at")
SELECT "libelle", 1, NOW(), NOW()
FROM "sites"
WHERE "actif"
ON CONFLICT ("libelle") DO NOTHING;

-- Villes : les localités déjà renseignées par des plaignants riverains.
INSERT INTO "villes" ("libelle", "ordre", "created_at", "updated_at")
SELECT DISTINCT TRIM("localite"), 1, NOW(), NOW()
FROM "declaration_identites"
WHERE "localite" IS NOT NULL AND LENGTH(TRIM("localite")) >= 3
ON CONFLICT ("libelle") DO NOTHING;

-- ⚠️ Les POSTES ne sont PAS amorcés, et c'est délibéré : ils doivent être rattachés à une
-- direction, or les fonctions déjà saisies ne disent pas laquelle. Les attribuer au hasard aurait
-- produit une cascade fausse, plus nuisible qu'une liste vide. Le champ étant facultatif, le
-- formulaire reste utilisable ; la liste est à créer en administration.

COMMIT;
