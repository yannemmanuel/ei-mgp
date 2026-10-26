-- Les sauvegardes de migration ne font pas partie du schéma applicatif ei_mgp.
-- Elles restent conservées, mais dans un espace dédié qui ne pollue ni Prisma ni structure.sql.

BEGIN;

CREATE SCHEMA IF NOT EXISTS ei_mgp_sauvegardes;

ALTER TABLE IF EXISTS ei_mgp.sauvegarde_20261026_sites
  SET SCHEMA ei_mgp_sauvegardes;
ALTER TABLE IF EXISTS ei_mgp.sauvegarde_20261026_directions
  SET SCHEMA ei_mgp_sauvegardes;
ALTER TABLE IF EXISTS ei_mgp.sauvegarde_20261026_postes
  SET SCHEMA ei_mgp_sauvegardes;
ALTER TABLE IF EXISTS ei_mgp.sauvegarde_20261026_rattachements_dossiers
  SET SCHEMA ei_mgp_sauvegardes;
ALTER TABLE IF EXISTS ei_mgp.sauvegarde_20261026_rattachements_users
  SET SCHEMA ei_mgp_sauvegardes;
ALTER TABLE IF EXISTS ei_mgp.sauvegarde_20261026_rattachements_postes
  SET SCHEMA ei_mgp_sauvegardes;

COMMIT;
