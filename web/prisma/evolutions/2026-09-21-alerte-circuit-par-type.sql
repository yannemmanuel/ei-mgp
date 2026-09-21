-- Le circuit accéléré se coche PAR TYPE DE DÉCLARATION, pas par rôle.
--
-- ⚠️ CORRECTION D'UNE ÉVOLUTION DU MÊME JOUR. `2026-09-21-roles-entierement-parametrables.sql` a
-- posé `roles.alerte_circuit_critique`, un booléen par rôle. Croisé avec `role_parcours`, il ne
-- reproduit PAS la matrice du CDC §6.5 : le Service MGP et la DG y sont alertés sur trois types de
-- grief mais pas sur l'évènement indésirable, et ils portent les quatre types. Un seul booléen ne
-- peut pas dire « oui ici, non là ».
--
-- Mesuré avant d'écrire cette évolution, le croisement ajoutait trois alertes que le CDC ne
-- prévoit pas : `service_mgp` et `dg` sur `ei_employe`, `correspondant_mgp` sur
-- `grief_communaute`. Élargir un circuit d'alerte n'est pas anodin — c'est du courrier envoyé à
-- des gens que le métier n'a pas désignés, sur les déclarations les plus sensibles.
--
-- Le drapeau descend donc d'un cran, sur `role_parcours`, où il se lit « ce rôle est alerté en
-- circuit accéléré SUR CE TYPE ». C'est exactement la maille de la matrice du CDC, et la même
-- grille que les cases de types déjà cochées dans les habilitations.
--
-- ⚠️ LA COLONNE PORTÉE PAR `roles` EST SUPPRIMÉE. Elle a été créée quelques heures plus tôt par
-- l'évolution précédente, n'a jamais été déployée, et ne contient que des valeurs semées par cette
-- même évolution — aucune saisie, aucune donnée métier. La laisser en place serait pire : un nom
-- exact, une sémantique fausse, et personne pour savoir laquelle des deux fait foi.

BEGIN;

ALTER TABLE "role_parcours"
  ADD COLUMN IF NOT EXISTS "alerte_circuit_critique" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "role_parcours"."alerte_circuit_critique" IS
  'RG-08 / CDC §6.5 : ce rôle est alerté immédiatement quand une déclaration de CE type, dans son périmètre, est qualifiée critique.';

-- La matrice du CDC §6.5, recopiée telle quelle.
--
-- « Président CSST » y est résolu par l'attribut `poste` et non par un rôle (DT-07) ; « Service
-- Prévention » et « toutes les Directions » passent par les destinataires supplémentaires du
-- gabarit `circuit_critique` (DT-28), faute de rôle correspondant. Aucun des deux n'a sa place
-- ici, et les inventer ferait diverger la matrice de ce que le métier a écrit.
UPDATE "role_parcours" rp
   SET "alerte_circuit_critique" = TRUE
  FROM "roles" r, "parcours" p
 WHERE rp."role_id" = r."id"
   AND rp."parcours_id" = p."id"
   AND r."guard_name" = 'web'
   AND (r."name", p."code") IN (
     ('rqse',                       'ei_employe'),
     ('secretaire_csst',            'ei_employe'),

     ('correspondant_mgp',          'grief_employe'),
     ('responsable_grief_employe',  'grief_employe'),
     ('service_mgp',                'grief_employe'),
     ('dg',                         'grief_employe'),

     ('correspondant_mgp',          'grief_sous_traitant'),
     ('captage_grief_soustraitant', 'grief_sous_traitant'),
     ('service_mgp',                'grief_sous_traitant'),
     ('dg',                         'grief_sous_traitant'),

     ('service_mgp',                'grief_communaute'),
     ('dg',                         'grief_communaute')
   );

ALTER TABLE "roles" DROP COLUMN IF EXISTS "alerte_circuit_critique";

COMMIT;
