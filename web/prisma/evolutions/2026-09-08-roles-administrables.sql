-- Rôles administrables : libellé, description, activation.
--
-- Purement ADDITIVE : trois colonnes ajoutées, aucune donnée touchée, aucune contrainte existante
-- modifiée. Réversible par trois DROP COLUMN.
--
-- Appliquée à la main plutôt que par `prisma migrate` : la base ne connaît aucun historique de
-- migration Prisma (elle vient de Laravel), et lancer `migrate` sur une base non initialisée
-- proposerait de la réinitialiser. `prisma db pull` réintrospecte ensuite le schéma.
--
-- `name` reste intouchable et le restera : c'est l'identifiant technique référencé par
-- `model_has_roles`, par le catalogue `authz/roles.ts` et par le cloisonnement
-- `authz/parcours.ts`. Le renommer romprait silencieusement le périmètre des parcours.

BEGIN;

ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "libelle" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "actif" BOOLEAN NOT NULL DEFAULT TRUE;

-- Reprise des libellés jusqu'ici portés par le code (`authz/libelles.ts`). La base devient la
-- source d'affichage ; le code conserve les mêmes valeurs en référence, comme pour les
-- permissions.
UPDATE "roles" SET "libelle" = "valeurs"."libelle"
FROM (VALUES
  ('employe_declarant',          'Employé déclarant'),
  ('agent_relais',               'Agent relais'),
  ('secretaire_csst',            'Secrétaire CSST / Comité SST'),
  ('rqse',                       'RQSE — Responsable qualité, sécurité, environnement'),
  ('rgp',                        'RGP — Responsable gestion des plaintes'),
  ('responsable_grief_employe',  'DRH / Directeur — griefs employés'),
  ('correspondant_mgp',          'Correspondant MGP / Enquêteur'),
  ('service_mgp',                'Service MGP / DADD'),
  ('comite_ethique',             'Comité éthique / Syndicats'),
  ('captage_grief_communaute',   'Captage — griefs communauté'),
  ('captage_grief_soustraitant', 'Captage — griefs sous-traitants'),
  ('dg',                         'Direction générale'),
  ('dpo',                        'DPO — Référent protection des données'),
  ('administrateur_digital',     'Administrateur digital'),
  ('auditeur',                   'Auditeur')
) AS "valeurs"("name", "libelle")
WHERE "roles"."name" = "valeurs"."name" AND "roles"."libelle" IS NULL;

-- Filet : un rôle qui n'aurait pas de libellé retombe sur son identifiant technique, jamais sur
-- NULL — l'écran afficherait sinon une ligne sans nom.
UPDATE "roles" SET "libelle" = "name" WHERE "libelle" IS NULL;

ALTER TABLE "roles" ALTER COLUMN "libelle" SET NOT NULL;

COMMIT;
