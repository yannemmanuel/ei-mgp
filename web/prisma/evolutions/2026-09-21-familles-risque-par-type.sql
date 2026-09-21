-- Les familles de risque s'appliquent TYPE PAR TYPE, et plus à tout le monde.
--
-- ⚠️ ADDITIVE : une colonne ajoutée avec une valeur par défaut, puis renseignée. Rien n'est
-- supprimé. En particulier, `dossiers.famille_risque_id` n'est ni retiré ni vidé : les dossiers
-- qui portent une famille la gardent, et leur fiche continue de l'afficher.
--
-- Décision métier : l'évènement indésirable n'en relève pas. Sa nomenclature propre — catégorie au
-- dépôt, gravité à la qualification — dit déjà ce qu'il faut en savoir, et la famille de risque
-- n'y ajoutait qu'une case à remplir de plus. Vérifié avant la bascule : aucun des cinq évènements
-- indésirables en base n'en portait une, la question ne se posait donc déjà pas en pratique.
--
-- ⚠️ CE N'EST PAS UNE SUPPRESSION, C'EST UN PARAMÈTRE — et c'est la demande : « on va retirer les
-- familles seulement sur les EI mais on va laisser une possibilité de paramétrage dans le
-- backoffice ». Écrire la règle dans le code aurait demandé un déploiement pour la défaire ; elle
-- se coche dans `/administration/familles-risque`, type par type.

BEGIN;

ALTER TABLE "parcours"
  ADD COLUMN IF NOT EXISTS "familles_risque_actives" BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN "parcours"."familles_risque_actives" IS
  'Les traitants de ce type de déclaration qualifient-ils une famille de risque ? Décoché, la carte disparaît de la fiche et le type sort de la répartition du tableau de bord — les familles déjà posées sont conservées.';

/*
  ⚠️ VRAI PAR DÉFAUT, et c'est le sens sûr.

  Les trois types de grief s'en servent : les décocher par inadvertance ferait disparaître d'un
  coup une qualification que le traitement utilise, et la répartition du tableau de bord avec
  elle. L'oubli inverse — un type qu'on aurait dû décocher et qui ne l'est pas — se voit tout de
  suite : la carte est là, sur la fiche.
*/
UPDATE "parcours"
   SET "familles_risque_actives" = FALSE,
       "updated_at" = NOW()
 WHERE "code" = 'ei_employe';

COMMIT;
