-- Liste officielle des postes issue du retour QR Code Premier Jet.
-- La liste étant globale dans le document, chaque poste est proposé sous chaque direction.

BEGIN;

CREATE TABLE IF NOT EXISTS ei_mgp.sauvegarde_20261026_postes AS
SELECT * FROM ei_mgp.postes;

DELETE FROM ei_mgp.postes;

WITH libelles(libelle, ordre) AS (
  VALUES
    ('Directeur Général (DG)', 1),
    ('Directeur Général Adjoint (DGA)', 2),
    ('Directeur Central (DC)', 3),
    ('Directeur (D)', 4),
    ('Directeur Adjoint (DA)', 5),
    ('Sous-Directeur (SD)', 6),
    ('Directeur Régional (DR)', 7),
    ('Adjoint Technique (AT)', 8),
    ('Chef de Service (CS)', 9),
    ('Manager d’Agence', 10),
    ('Assistant d’Exploitation (AE)', 11),
    ('Ingénieur Études', 12),
    ('Ingénieur Travaux', 13),
    ('Responsable Qualité Sécurité Env. (RQSE)', 14),
    ('Responsable Gestion Personnel (RGP)', 15),
    ('Responsable Gestion Stock (RGS)', 16),
    ('Responsable Facturation (RF)', 17),
    ('Responsable Commercial (RC)', 18),
    ('Responsable Technique (RT)', 19),
    ('Responsable Formation', 20),
    ('Responsable Informatique Zone (RIZ)', 21),
    ('Responsable de Zone (RZ)', 22),
    ('Chef d’équipe', 23),
    ('Chef de Section', 24),
    ('Chimiste', 25),
    ('Responsable Chimiste Zone', 26),
    ('Facturier', 27),
    ('Agent de Zone (AZ)', 28),
    ('Agent de Réseau (AR)', 29),
    ('Agent d’Entretien Réseau', 30),
    ('Agent d’Entretien Stations', 31),
    ('Agent de Production Électromécanicien (APEM)', 32),
    ('Électromécanicien Itinérant (EMI)', 33),
    ('Chargé d’Études', 34),
    ('Conducteur Travaux (CT)', 35),
    ('Médecin', 36),
    ('Infirmier', 37),
    ('Chauffeur', 38),
    ('Chauffeur-Livreur', 39),
    ('AC Caissière', 40),
    ('Secrétaire/Assistante de Direction', 41),
    ('Agent Administratif (ADM)', 42),
    ('Conseiller Client', 43),
    ('Cadre', 44),
    ('Chargé Relation client', 45),
    ('Technicien Hydraulique', 46),
    ('Chaudronnier', 47),
    ('Monteur', 48),
    ('Agent de Litige', 49),
    ('Chef de Centre (CC)', 50),
    ('Mécanicien', 51),
    ('Comptable', 52),
    ('Technicien Recherche Fuite', 53),
    ('Agent de Surveillance Réseau', 54),
    ('Ingénieur Études et Travaux', 55),
    ('Dessinateur', 56),
    ('Ingénieur Hydraulique', 57),
    ('Assistant Ressources Humaines', 58),
    ('Chef d’Usine (CU)', 59),
    ('Métreur', 60),
    ('Autre', 61)
), directions_officielles AS (
  SELECT id
  FROM ei_mgp.directions
  WHERE code IN (
    'DG','DTD','DADA','DPHV','DFC','DL','DBCG','DET','DQE','DP','DAPA','DC','DASST',
    'DM','DMRC','DGC','DCMEAU','DRH','DCI','DADD','DRANE','DRAS','DRYOP','DRABO','DRBC',
    'DRSE','DRE','DRCS','DRSO','DRCO','DRO','DRC','DRN'
  )
)
INSERT INTO ei_mgp.postes (direction_id, libelle, ordre, actif, created_at, updated_at)
SELECT d.id, l.libelle, l.ordre, TRUE, NOW(), NOW()
FROM directions_officielles d
CROSS JOIN libelles l;

COMMIT;
