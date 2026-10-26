-- Action réalisée immédiatement après un événement indésirable.
-- Colonne nullable : les dossiers existants et les autres parcours restent inchangés.
ALTER TABLE "ei_mgp"."dossiers"
  ADD COLUMN IF NOT EXISTS "action_immediate" TEXT;

COMMENT ON COLUMN "ei_mgp"."dossiers"."action_immediate" IS
  'Action réalisée immédiatement après les faits, déclarée lors du signalement d’un EI.';
