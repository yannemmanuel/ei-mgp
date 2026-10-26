-- Référentiel officiel des CSST et directions.
-- Cette évolution est réexécutable. Les références portées par les dossiers, comptes et postes
-- sont transférées avant la suppression physique des anciennes entrées.

BEGIN;

-- Sauvegarde interne préalable, utile lorsque pg_dump n'est pas disponible sur le poste.
-- Les tables ne sont créées qu'une fois afin qu'une éventuelle réexécution ne remplace jamais
-- l'état original qui permettrait une restauration manuelle.
CREATE TABLE IF NOT EXISTS ei_mgp.sauvegarde_20261026_sites AS
SELECT * FROM ei_mgp.sites;

CREATE TABLE IF NOT EXISTS ei_mgp.sauvegarde_20261026_directions AS
SELECT * FROM ei_mgp.directions;

CREATE TABLE IF NOT EXISTS ei_mgp.sauvegarde_20261026_rattachements_dossiers AS
SELECT id, site_id, direction_id, direction_declarant_id FROM ei_mgp.dossiers;

CREATE TABLE IF NOT EXISTS ei_mgp.sauvegarde_20261026_rattachements_users AS
SELECT id, site_id, direction_id FROM ei_mgp.users;

CREATE TABLE IF NOT EXISTS ei_mgp.sauvegarde_20261026_rattachements_postes AS
SELECT id, direction_id FROM ei_mgp.postes;

-- Reprendre les entrées historiques équivalentes au lieu d'en créer des doublons.
UPDATE ei_mgp.sites SET code = 'CSST-SIEGE', updated_at = NOW()
WHERE code = 'SITE-SIEGE' AND NOT EXISTS (SELECT 1 FROM ei_mgp.sites WHERE code = 'CSST-SIEGE');
UPDATE ei_mgp.sites SET code = 'CSST-PALMERAIE', updated_at = NOW()
WHERE code = 'SITE-PALMERAIE' AND NOT EXISTS (SELECT 1 FROM ei_mgp.sites WHERE code = 'CSST-PALMERAIE');
UPDATE ei_mgp.sites SET code = 'CSST-DRYOP', updated_at = NOW()
WHERE code = 'SITE-YOP' AND NOT EXISTS (SELECT 1 FROM ei_mgp.sites WHERE code = 'CSST-DRYOP');

UPDATE ei_mgp.directions SET code = 'DRANE', updated_at = NOW()
WHERE code = '3451' AND NOT EXISTS (SELECT 1 FROM ei_mgp.directions WHERE code = 'DRANE');
UPDATE ei_mgp.directions SET code = 'DTD', updated_at = NOW()
WHERE code = '3334' AND NOT EXISTS (SELECT 1 FROM ei_mgp.directions WHERE code = 'DTD');
UPDATE ei_mgp.directions SET code = 'DMRC', updated_at = NOW()
WHERE code = '2234' AND NOT EXISTS (SELECT 1 FROM ei_mgp.directions WHERE code = 'DMRC');
UPDATE ei_mgp.directions SET code = 'DL', updated_at = NOW()
WHERE code = '0200' AND NOT EXISTS (SELECT 1 FROM ei_mgp.directions WHERE code = 'DL');

INSERT INTO ei_mgp.sites (code, libelle, actif, created_at, updated_at)
VALUES
  ('CSST-SIEGE', 'CSST Siège', TRUE, NOW(), NOW()),
  ('CSST-PALMERAIE', 'CSST Palmeraie', TRUE, NOW(), NOW()),
  ('CSST-DET', 'CSST Direction Études et Travaux (DET)', TRUE, NOW(), NOW()),
  ('CSST-DASST', 'CSST Direction Assainissement (DASST)', TRUE, NOW(), NOW()),
  ('CSST-DQE', 'CSST Direction Qualité Eau (DQE)', TRUE, NOW(), NOW()),
  ('CSST-DL', 'CSST Direction Logistique (DL)', TRUE, NOW(), NOW()),
  ('CSST-DC', 'CSST Direction Comptage (DC)', TRUE, NOW(), NOW()),
  ('CSST-DP', 'CSST Direction Production (DP)', TRUE, NOW(), NOW()),
  ('CSST-DM', 'CSST Direction Maintenance (DM)', TRUE, NOW(), NOW()),
  ('CSST-DRANE', 'CSST Direction Rég. Abidj. Nord-Est (DRANE)', TRUE, NOW(), NOW()),
  ('CSST-DRAS', 'CSST Direction Rég. Abidj. Sud (DRAS)', TRUE, NOW(), NOW()),
  ('CSST-DRYOP', 'CSST Direction Rég. Yopougon (DRYOP)', TRUE, NOW(), NOW()),
  ('CSST-DRABO', 'CSST Direction Rég. Abobo (DRABO)', TRUE, NOW(), NOW()),
  ('CSST-DRBC', 'CSST Direction Rég. Basse-Côte (DRBC)', TRUE, NOW(), NOW()),
  ('CSST-DRSE', 'CSST Direction Rég. Aboisso (DRSE)', TRUE, NOW(), NOW()),
  ('CSST-DRE', 'CSST Direction Rég. Abengourou (DRE)', TRUE, NOW(), NOW()),
  ('CSST-DRCS', 'CSST Direction Rég. Yamoussoukro (DRCS)', TRUE, NOW(), NOW()),
  ('CSST-DRSO', 'CSST Direction Rég. Gagnoa (DRSO)', TRUE, NOW(), NOW()),
  ('CSST-DRCO', 'CSST Direction Rég. Daloa (DRCO)', TRUE, NOW(), NOW()),
  ('CSST-DRO', 'CSST Direction Rég. Man (DRO)', TRUE, NOW(), NOW()),
  ('CSST-DRC', 'CSST Direction Rég. Bouaké (DRC)', TRUE, NOW(), NOW()),
  ('CSST-DRN', 'CSST Direction Rég. Korhogo (DRN)', TRUE, NOW(), NOW()),
  ('CSST-DCMEAU', 'CSST Direction CMEAU (DCMEAU)', TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  actif = TRUE,
  updated_at = NOW();

INSERT INTO ei_mgp.directions (code, libelle, actif, created_at, updated_at)
VALUES
  ('DG', 'Direction Générale', TRUE, NOW(), NOW()),
  ('DTD', 'Direction de la Transformation et du Digital', TRUE, NOW(), NOW()),
  ('DADA', 'Direction Adjoint Data Analytics', TRUE, NOW(), NOW()),
  ('DPHV', 'Direction du Projet Hydraulique Villageoise', TRUE, NOW(), NOW()),
  ('DFC', 'Direction Financière et Comptable', TRUE, NOW(), NOW()),
  ('DL', 'Direction Logistique', TRUE, NOW(), NOW()),
  ('DBCG', 'Direction du Budget et du Contrôle de Gestion', TRUE, NOW(), NOW()),
  ('DET', 'Direction Études et Travaux', TRUE, NOW(), NOW()),
  ('DQE', 'Direction Qualité Eau', TRUE, NOW(), NOW()),
  ('DP', 'Direction Production', TRUE, NOW(), NOW()),
  ('DAPA', 'Direction Adjoint Patrimoine Affermé', TRUE, NOW(), NOW()),
  ('DC', 'Direction Comptage', TRUE, NOW(), NOW()),
  ('DASST', 'Direction Assainissement', TRUE, NOW(), NOW()),
  ('DM', 'Direction Maintenance', TRUE, NOW(), NOW()),
  ('DMRC', 'Direction Marketing et Relations clients', TRUE, NOW(), NOW()),
  ('DGC', 'Direction Grands Comptes', TRUE, NOW(), NOW()),
  ('DCMEAU', 'Direction du Centre des Métiers de l''Eau', TRUE, NOW(), NOW()),
  ('DRH', 'Direction des Ressources Humaines', TRUE, NOW(), NOW()),
  ('DCI', 'Direction Contrôle Interne', TRUE, NOW(), NOW()),
  ('DADD', 'Direction Adjoint Développement Durable', TRUE, NOW(), NOW()),
  ('DRANE', 'Direction Rég. Abidjan Nord-Est', TRUE, NOW(), NOW()),
  ('DRAS', 'Direction Rég. Abidjan Sud', TRUE, NOW(), NOW()),
  ('DRYOP', 'Direction Rég. Yopougon', TRUE, NOW(), NOW()),
  ('DRABO', 'Direction Rég. Abobo', TRUE, NOW(), NOW()),
  ('DRBC', 'Direction Rég. Basse-Côte', TRUE, NOW(), NOW()),
  ('DRSE', 'Direction Rég. Aboisso', TRUE, NOW(), NOW()),
  ('DRE', 'Direction Rég. Abengourou', TRUE, NOW(), NOW()),
  ('DRCS', 'Direction Rég. Yamoussoukro', TRUE, NOW(), NOW()),
  ('DRSO', 'Direction Rég. Gagnoa', TRUE, NOW(), NOW()),
  ('DRCO', 'Direction Rég. Daloa', TRUE, NOW(), NOW()),
  ('DRO', 'Direction Rég. Man', TRUE, NOW(), NOW()),
  ('DRC', 'Direction Rég. Bouaké', TRUE, NOW(), NOW()),
  ('DRN', 'Direction Rég. Korhogo', TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  actif = TRUE,
  updated_at = NOW();

-- Transférer les références des anciennes directions qui n'ont pas été renommées plus haut.
-- DIR-OPS devient DP ; DIR-QHSE devient DADD. Les anciens codes numériques sont aussi traités
-- si une entrée officielle existait déjà avant cette évolution.
WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('3451', 'DRANE'), ('3334', 'DTD'), ('2234', 'DMRC'), ('0200', 'DL'),
    ('DIR-OPS', 'DP'), ('DIR-QHSE', 'DADD'), ('DIR-RH', 'DRH')
)
UPDATE ei_mgp.dossiers AS dossier
SET direction_id = nouvelle.id
FROM correspondances c
JOIN ei_mgp.directions ancienne ON ancienne.code = c.ancien_code
JOIN ei_mgp.directions nouvelle ON nouvelle.code = c.nouveau_code
WHERE dossier.direction_id = ancienne.id;

WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('3451', 'DRANE'), ('3334', 'DTD'), ('2234', 'DMRC'), ('0200', 'DL'),
    ('DIR-OPS', 'DP'), ('DIR-QHSE', 'DADD'), ('DIR-RH', 'DRH')
)
UPDATE ei_mgp.dossiers AS dossier
SET direction_declarant_id = nouvelle.id
FROM correspondances c
JOIN ei_mgp.directions ancienne ON ancienne.code = c.ancien_code
JOIN ei_mgp.directions nouvelle ON nouvelle.code = c.nouveau_code
WHERE dossier.direction_declarant_id = ancienne.id;

WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('3451', 'DRANE'), ('3334', 'DTD'), ('2234', 'DMRC'), ('0200', 'DL'),
    ('DIR-OPS', 'DP'), ('DIR-QHSE', 'DADD'), ('DIR-RH', 'DRH')
)
UPDATE ei_mgp.users AS compte
SET direction_id = nouvelle.id, updated_at = NOW()
FROM correspondances c
JOIN ei_mgp.directions ancienne ON ancienne.code = c.ancien_code
JOIN ei_mgp.directions nouvelle ON nouvelle.code = c.nouveau_code
WHERE compte.direction_id = ancienne.id;

-- Éviter un doublon (direction, libellé) avant de transférer les postes.
WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('3451', 'DRANE'), ('3334', 'DTD'), ('2234', 'DMRC'), ('0200', 'DL'),
    ('DIR-OPS', 'DP'), ('DIR-QHSE', 'DADD'), ('DIR-RH', 'DRH')
)
DELETE FROM ei_mgp.postes AS ancien_poste
USING correspondances c, ei_mgp.directions ancienne, ei_mgp.directions nouvelle
WHERE ancienne.code = c.ancien_code
  AND nouvelle.code = c.nouveau_code
  AND ancien_poste.direction_id = ancienne.id
  AND EXISTS (
    SELECT 1 FROM ei_mgp.postes nouveau_poste
    WHERE nouveau_poste.direction_id = nouvelle.id
      AND nouveau_poste.libelle = ancien_poste.libelle
  );

WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('3451', 'DRANE'), ('3334', 'DTD'), ('2234', 'DMRC'), ('0200', 'DL'),
    ('DIR-OPS', 'DP'), ('DIR-QHSE', 'DADD'), ('DIR-RH', 'DRH')
)
UPDATE ei_mgp.postes AS poste
SET direction_id = nouvelle.id, updated_at = NOW()
FROM correspondances c
JOIN ei_mgp.directions ancienne ON ancienne.code = c.ancien_code
JOIN ei_mgp.directions nouvelle ON nouvelle.code = c.nouveau_code
WHERE poste.direction_id = ancienne.id;

DELETE FROM ei_mgp.directions
WHERE code IN ('3451', '3334', '2234', '0200', 'DIR-OPS', 'DIR-QHSE', 'DIR-RH');

-- Transférer les références des anciens sites vers les nouveaux CSST avant leur suppression.
-- L'ancien site Adjamé, absent du nouveau référentiel, est repris par le CSST Siège.
WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('SITE-SIEGE', 'CSST-SIEGE'),
    ('SITE-PALMERAIE', 'CSST-PALMERAIE'),
    ('SITE-YOP', 'CSST-DRYOP'),
    ('SITE-ADJAME', 'CSST-SIEGE')
)
UPDATE ei_mgp.directions AS direction
SET site_id = nouveau.id, updated_at = NOW()
FROM correspondances c
JOIN ei_mgp.sites ancien ON ancien.code = c.ancien_code
JOIN ei_mgp.sites nouveau ON nouveau.code = c.nouveau_code
WHERE direction.site_id = ancien.id;

WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('SITE-SIEGE', 'CSST-SIEGE'),
    ('SITE-PALMERAIE', 'CSST-PALMERAIE'),
    ('SITE-YOP', 'CSST-DRYOP'),
    ('SITE-ADJAME', 'CSST-SIEGE')
)
UPDATE ei_mgp.dossiers AS dossier
SET site_id = nouveau.id
FROM correspondances c
JOIN ei_mgp.sites ancien ON ancien.code = c.ancien_code
JOIN ei_mgp.sites nouveau ON nouveau.code = c.nouveau_code
WHERE dossier.site_id = ancien.id;

WITH correspondances(ancien_code, nouveau_code) AS (
  VALUES
    ('SITE-SIEGE', 'CSST-SIEGE'),
    ('SITE-PALMERAIE', 'CSST-PALMERAIE'),
    ('SITE-YOP', 'CSST-DRYOP'),
    ('SITE-ADJAME', 'CSST-SIEGE')
)
UPDATE ei_mgp.users AS compte
SET site_id = nouveau.id, updated_at = NOW()
FROM correspondances c
JOIN ei_mgp.sites ancien ON ancien.code = c.ancien_code
JOIN ei_mgp.sites nouveau ON nouveau.code = c.nouveau_code
WHERE compte.site_id = ancien.id;

DELETE FROM ei_mgp.sites
WHERE code IN ('SITE-SIEGE', 'SITE-PALMERAIE', 'SITE-YOP', 'SITE-ADJAME');

-- Les rattachements évidents par acronyme sont initialisés uniquement s'ils sont absents.
UPDATE ei_mgp.directions AS d
SET site_id = s.id, updated_at = NOW()
FROM ei_mgp.sites AS s
WHERE s.code = 'CSST-' || d.code
  AND d.code IN (
    'DL', 'DET', 'DQE', 'DP', 'DC', 'DASST', 'DM', 'DCMEAU',
    'DRANE', 'DRAS', 'DRYOP', 'DRABO', 'DRBC', 'DRSE', 'DRE',
    'DRCS', 'DRSO', 'DRCO', 'DRO', 'DRC', 'DRN'
  )
  AND d.site_id IS NULL;

-- Les directions centrales relèvent du CSST Siège, sans écraser un rattachement existant.
UPDATE ei_mgp.directions AS d
SET site_id = s.id, updated_at = NOW()
FROM ei_mgp.sites AS s
WHERE s.code = 'CSST-SIEGE'
  AND d.code IN ('DG', 'DTD', 'DADA', 'DPHV', 'DFC', 'DBCG', 'DAPA', 'DMRC', 'DGC', 'DRH', 'DCI', 'DADD')
  AND d.site_id IS NULL;

COMMIT;
