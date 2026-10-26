-- Remplace les listes plates « lieux / villes » par la cascade Région → Commune.
-- Les dossiers conservent leurs anciennes valeurs en clair ; seuls les référentiels évoluent.

BEGIN;

CREATE SCHEMA IF NOT EXISTS ei_mgp_sauvegardes;
CREATE TABLE IF NOT EXISTS ei_mgp_sauvegardes.sauvegarde_20261026_lieux AS
SELECT * FROM ei_mgp.lieux;
CREATE TABLE IF NOT EXISTS ei_mgp_sauvegardes.sauvegarde_20261026_villes AS
SELECT * FROM ei_mgp.villes;

ALTER TABLE ei_mgp.villes ADD COLUMN IF NOT EXISTS region_id BIGINT;

-- Les anciennes valeurs restent disponibles pour l'historique, mais ne sont plus proposées.
UPDATE ei_mgp.villes SET actif = FALSE, updated_at = NOW();
UPDATE ei_mgp.lieux SET actif = FALSE, updated_at = NOW();

WITH regions(libelle, ordre) AS (
  VALUES
    ('Agnéby-Tiassa', 1), ('Bafing', 2), ('Bagoué', 3), ('Bélier', 4),
    ('Béré', 5), ('Bounkani', 6), ('Cavally', 7), ('Folon', 8), ('Gbêkê', 9),
    ('Gôh', 10), ('Grands-Ponts', 11), ('Guémon', 12), ('Hambol', 13),
    ('Haut-Sassandra', 14), ('Indénié-Djuablin', 15), ('Iffou', 16),
    ('Kabadougou', 17), ('La Mé', 18), ('Lôh-Djiboua', 19), ('Marahoué', 20),
    ('Moronou', 21), ('Nawa', 22), ('N’Zi', 23), ('Poro', 24), ('San-Pédro', 25),
    ('Sud-Comoé', 26), ('Tonkpi', 27), ('Tchologo', 28), ('Worodougou', 29),
    ('Gontougo', 30), ('Zanzan', 31), ('ABIDJAN', 32)
)
INSERT INTO ei_mgp.lieux (libelle, ordre, actif, created_at, updated_at)
SELECT libelle, ordre, TRUE, NOW(), NOW() FROM regions
ON CONFLICT (libelle) DO UPDATE SET
  ordre = EXCLUDED.ordre,
  actif = TRUE,
  updated_at = NOW();

ALTER TABLE ei_mgp.villes DROP CONSTRAINT IF EXISTS villes_libelle_unique;
DROP INDEX IF EXISTS ei_mgp.villes_libelle_unique;
CREATE UNIQUE INDEX IF NOT EXISTS villes_region_libelle_unique
  ON ei_mgp.villes(region_id, libelle);
CREATE INDEX IF NOT EXISTS villes_region_id_index ON ei_mgp.villes(region_id);

WITH listes(region, communes) AS (
  VALUES
    ('Agnéby-Tiassa', 'Agboville, Azaguié, N’Douci, Rubino, Sikensi, Taabo, Tiassalé'),
    ('Bafing', 'Booko, Borotou, Koro, Ouaninou, Touba'),
    ('Bagoué', 'Boundiali, Gbon, Kasséré, Kolia, Kouto, Tengréla'),
    ('Bélier', 'Didiévi, Djékanou, Kokoumbo, Tiébissou, Toumodi'),
    ('Béré', 'Dianra, Kounahiri, Mankono'),
    ('Bounkani', 'Bouna, Doropo, Nassian, Téhini'),
    ('Cavally', 'Bloléquin, Guiglo, Taï, Toulepleu'),
    ('Folon', 'Kaniasso, Minignan, Tienko'),
    ('Gbêkê', 'Béoumi, Bouaké, Botro, Brobo, Diabo, Djébonoua, Sakassou'),
    ('Gôh', 'Gagnoa, Guibéroua, Oumé, Ouragahio'),
    ('Grands-Ponts', 'Dabou, Grand-Lahou, Jacqueville'),
    ('Guémon', 'Bangolo, Duékoué, Facobly, Kouibly'),
    ('Hambol', 'Dabakala, Fronan, Katiola, Niakaramandougou, Tafiré'),
    ('Haut-Sassandra', 'Bédiala, Daloa, Gboguhé, Issia, Vavoua, Zoukougbeu'),
    ('Indénié-Djuablin', 'Abengourou, Agnibilékrou, Bettié, Niablé'),
    ('Iffou', 'Daoukro, M’Bahiakro, Ouellé, Prikro'),
    ('Kabadougou', 'Dioulatiédougou, Gbéleban, Madinani, Odienné, Samatiguila, Séguélon, Tiémé'),
    ('La Mé', 'Adzopé, Afféry, Agou, Akoupé, Alépé, Yakassé-Attobrou'),
    ('Lôh-Djiboua', 'Divo, Guitry, Hiré, Lakota, Zikisso'),
    ('Marahoué', 'Bouaflé, Bonon, Sinfra, Zuénoula'),
    ('Moronou', 'Anoumaba, Arrah, Bongouanou, M’Batto'),
    ('Nawa', 'Buyo, Guéyo, Méagui, Soubré'),
    ('N’Zi', 'Bocanda, Dimbokro, Kouassi-Kouassikro'),
    ('Poro', 'Dikodougou, Korhogo, M’Bengué, Napié, Niellé, Sinématiali, Sirasso, Tioroniaradougou'),
    ('San-Pédro', 'Grand-Béréby, San-Pédro, Tabou'),
    ('Sud-Comoé', 'Aboisso, Adiaké, Ayamé, Assinie-Mafia, Bonoua, Grand-Bassam, Maféré, Tiapoum'),
    ('Tonkpi', 'Biankouma, Bin-Houyé, Danané, Man, Logoualé, Sangouiné, Sipilou, Zouan-Hounien'),
    ('Tchologo', 'Diawala, Ferkessédougou, Kong, Koumbala, Ouangolodougou'),
    ('Worodougou', 'Dualla, Kani, Massala, Morondo, Séguéla, Sifié, Worofla'),
    ('Gontougo', 'Bondoukou, Koun-Fao, Sandégué, Tanda, Transua'),
    ('Zanzan', 'Bouna, Bondoukou'),
    ('ABIDJAN', 'Cocody, Yopougon, Plateau, Adjamé, Abobo, Koumassi, Marcory, Port-Bouët, Treichville, Attécoubé, Vridi')
), communes AS (
  SELECT region, trim(commune) AS libelle,
    row_number() OVER (PARTITION BY region ORDER BY ordinalite)::int AS ordre
  FROM listes
  CROSS JOIN LATERAL regexp_split_to_table(communes, ',') WITH ORDINALITY AS c(commune, ordinalite)
)
INSERT INTO ei_mgp.villes (region_id, libelle, ordre, actif, created_at, updated_at)
SELECT r.id, c.libelle, c.ordre, TRUE, NOW(), NOW()
FROM communes c
JOIN ei_mgp.lieux r ON r.libelle = c.region
ON CONFLICT (region_id, libelle) DO UPDATE SET
  ordre = EXCLUDED.ordre,
  actif = TRUE,
  updated_at = NOW();

ALTER TABLE ei_mgp.villes DROP CONSTRAINT IF EXISTS villes_region_id_fkey;
ALTER TABLE ei_mgp.villes ADD CONSTRAINT villes_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES ei_mgp.lieux(id) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT;
