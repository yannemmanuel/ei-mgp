-- L'habilitation par type de déclaration se coche dans les habilitations.
--
-- ⚠️ ADDITIVE : une table créée et remplie. Rien n'est supprimé, rien n'est modifié.
--
-- Jusqu'ici, les types de déclaration qu'un rôle ouvre étaient écrits DANS LE CODE
-- (`ROLES_PAR_PARCOURS`, src/server/authz/parcours.ts) : l'écran des habilitations les affichait
-- en lecture seule, avec la mention « décrit par le code ». Confier un grief sous-traitant à un
-- nouveau rôle demandait un déploiement.
--
-- ⚠️ LA TABLE EST REMPLIE À L'IDENTIQUE de ce que le code décidait jusqu'à aujourd'hui. C'est la
-- condition pour que personne ne perde ni ne gagne un accès le jour de la bascule : le
-- comportement est le même, seul l'endroit où la règle vit a changé.
--
-- ⚠️ `utilisateur_parcours` N'EST PAS TOUCHÉE. L'attribution par personne cesse d'entrer dans la
-- décision — le rôle décide seul (décision métier du 2026-09-20) —, mais la table reste : elle
-- porte ce qui avait été attribué compte par compte, et l'effacer rendrait ce paramétrage
-- irrécupérable si la décision était revue.

BEGIN;

CREATE TABLE IF NOT EXISTS "role_parcours" (
  "id"          BIGSERIAL PRIMARY KEY,
  "role_id"     BIGINT NOT NULL,
  "parcours_id" BIGINT NOT NULL,
  "created_at"  TIMESTAMP(0),
  "updated_at"  TIMESTAMP(0),
  CONSTRAINT "role_parcours_role_id_foreign"
    FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE,
  CONSTRAINT "role_parcours_parcours_id_foreign"
    FOREIGN KEY ("parcours_id") REFERENCES "parcours" ("id") ON DELETE CASCADE,
  CONSTRAINT "role_parcours_unique" UNIQUE ("role_id", "parcours_id")
);

CREATE INDEX IF NOT EXISTS "role_parcours_role_id_index" ON "role_parcours" ("role_id");

COMMENT ON TABLE "role_parcours" IS
  'Types de déclaration qu''un rôle ouvre. Administrable depuis /administration/habilitations.';

/*
  Reprise à l'identique de la table qui vivait dans le code.

  Les rôles désactivés (`secretaire_csst`, `rqse`, `correspondant_mgp`) gardent leurs lignes : ils
  ne confèrent rien tant qu'ils sont éteints, et les omettre ici ferait perdre leur périmètre le
  jour où l'un d'eux serait réactivé.

  Les rôles transverses reçoivent les QUATRE types explicitement. Ils les avaient par une règle
  séparée, écrite elle aussi dans le code ; les inscrire ici supprime cette seconde vérité — un
  administrateur lit désormais le périmètre d'un rôle au même endroit, quel qu'il soit.
*/
INSERT INTO "role_parcours" ("role_id", "parcours_id", "created_at", "updated_at")
SELECT r."id", p."id", NOW(), NOW()
  FROM (VALUES
    ('charge_securite',            'ei_employe'),
    ('secretaire_csst',            'ei_employe'),
    ('rqse',                       'ei_employe'),

    ('correspondant_drh',          'grief_employe'),
    ('correspondant_dadd',         'grief_communaute'),
    ('correspondant_dl',           'grief_sous_traitant'),

    ('responsable_mgp_structure',  'grief_employe'),
    ('responsable_mgp_structure',  'grief_sous_traitant'),
    ('responsable_mgp_structure',  'grief_communaute'),

    ('rgp',                        'grief_employe'),
    ('responsable_grief_employe',  'grief_employe'),
    ('comite_ethique',             'grief_employe'),

    ('correspondant_mgp',          'grief_employe'),
    ('correspondant_mgp',          'grief_sous_traitant'),
    ('correspondant_mgp',          'grief_communaute'),

    ('captage_grief_soustraitant', 'grief_sous_traitant'),
    ('captage_grief_communaute',   'grief_communaute'),

    ('service_mgp', 'ei_employe'), ('service_mgp', 'grief_employe'),
    ('service_mgp', 'grief_sous_traitant'), ('service_mgp', 'grief_communaute'),

    ('dg', 'ei_employe'), ('dg', 'grief_employe'),
    ('dg', 'grief_sous_traitant'), ('dg', 'grief_communaute'),

    ('auditeur', 'ei_employe'), ('auditeur', 'grief_employe'),
    ('auditeur', 'grief_sous_traitant'), ('auditeur', 'grief_communaute'),

    ('dpo', 'ei_employe'), ('dpo', 'grief_employe'),
    ('dpo', 'grief_sous_traitant'), ('dpo', 'grief_communaute')
  ) AS souhaite(role_name, parcours_code)
  JOIN "roles"    r ON r."name" = souhaite.role_name AND r."guard_name" = 'web'
  JOIN "parcours" p ON p."code" = souhaite.parcours_code
ON CONFLICT ("role_id", "parcours_id") DO NOTHING;

COMMENT ON COLUMN "role_parcours"."role_id" IS
  'Supprimer le rôle emporte ses habilitations de parcours : elles n''ont de sens qu''avec lui.';

COMMIT;
