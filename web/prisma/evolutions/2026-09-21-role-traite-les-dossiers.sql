-- Quels rôles TRAITENT les dossiers — un paramètre, plus une déduction.
--
-- ⚠️ ADDITIVE : une colonne ajoutée avec une valeur par défaut, puis renseignée. Rien n'est
-- supprimé, aucune autre colonne n'est touchée.
--
-- ⚠️ LE DÉFAUT QUE CETTE ÉVOLUTION CORRIGE. « Qui répond d'un dossier » était déduit de la
-- permission `dossiers.status.update` — « peut faire avancer un dossier ». Ce sont deux choses
-- différentes, et le Service MGP le montre : il peut faire avancer un dossier, notamment après
-- une réouverture, mais il n'en est pas le traitant. Il apparaissait pourtant comme titulaire de
-- TOUS les dossiers, dans « Qui traite ce dossier » comme dans « Vos dossiers à traiter ».
--
-- Ce sont les correspondants qui traitent. Aucune permission ne dit cela — c'est une donnée
-- d'organisation, pas un droit —, et la déduire d'un droit voisin ne pouvait que se tromper.
-- Elle se paramètre donc, rôle par rôle, dans l'écran des habilitations.

BEGIN;

ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "traite_dossiers" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "roles"."traite_dossiers" IS
  'Ce rôle a la CHARGE des dossiers de son périmètre : il apparaît comme titulaire et les voit dans « vos dossiers à traiter ». Distinct de dossiers.status.update, qui dit seulement qu''il peut les faire avancer.';

/*
  ⚠️ FAUX PAR DÉFAUT, et c'est le sens sûr.

  Un rôle qu'on oublie de cocher n'apparaît nulle part comme titulaire : on s'en aperçoit, et on
  coche. Un rôle coché à tort se voit attribuer des dossiers dont il ne répond pas — c'est
  exactement le défaut qu'on corrige, et il est passé inaperçu plusieurs jours.

  Les rôles ci-dessous sont ceux qui instruisent réellement : les correspondants par type de
  grief, le responsable MGP de structure, et le chargé de sécurité pour les évènements
  indésirables. `secretaire_csst`, `rqse` et `correspondant_mgp` sont désactivés mais gardent leur
  valeur : réactiver l'un d'eux doit lui rendre sa charge, pas l'obliger à la redécouvrir.

  ⚠️ NE SONT PAS COCHÉS, et c'est la correction demandée : `service_mgp` et `dg`. Ils pilotent,
  arbitrent et peuvent faire avancer un dossier — ils n'en sont pas les traitants.
*/
UPDATE "roles"
   SET "traite_dossiers" = TRUE,
       "updated_at" = NOW()
 WHERE "guard_name" = 'web'
   AND "name" IN (
     'charge_securite',
     'secretaire_csst',
     'rqse',
     'correspondant_drh',
     'correspondant_dadd',
     'correspondant_dl',
     'correspondant_mgp',
     'responsable_mgp_structure',
     'responsable_grief_employe'
   );

COMMIT;
