-- Le statut « Affecté » quitte le circuit : on n'affecte plus les dossiers.
--
-- ⚠️ NON DESTRUCTIVE. La ligne `statuts_dossier` est DÉSACTIVÉE, jamais supprimée : huit lignes
-- d'historique la citent (quatre dossiers y sont passés), et RG-04 fait de cet historique un
-- registre en ajout seul. Les fiches de ces dossiers continuent d'afficher « Reçu → Affecté →
-- En analyse » ; c'est ce qui s'est réellement produit, et le réécrire serait falsifier une trace.
--
-- Aucun dossier ne s'y trouve aujourd'hui (vérifié : 0), et plus aucun ne peut y entrer :
-- `ROLES_AFFECTATION_AUTOMATIQUE` est vide sur les quatre types depuis le 2026-09-20, donc
-- `creerDeclaration()` n'y transitait plus. L'état était devenu inatteignable sans que rien ne le
-- dise — il restait proposé dans les grilles et dans les écrans d'administration.
--
-- Le circuit devient « Reçu → En analyse ».

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. ⚠️ LA MOITIÉ QU'ON PERDRAIT EN SILENCE : qui peut faire le PREMIER pas
-- ---------------------------------------------------------------------------------------------
--
-- « Affecté » était l'étape de départ de la première action réelle sur un grief. Les correspondants
-- y étaient cochés, et pas sur « Reçu » — où seul le Service MGP figurait, pour l'affectation
-- manuelle de secours.
--
-- Retirer l'étape sans reporter ses cases aurait donc laissé, sur les trois types de grief, le seul
-- Service MGP capable de démarrer un dossier. Le correspondant DRH, le correspondant DL, le
-- correspondant DADD, le responsable MGP de structure et le responsable des griefs employés
-- auraient vu leurs dossiers arriver sans pouvoir les faire avancer d'un cran — sans message, sans
-- erreur, et sans que personne sache à qui s'adresser.
--
-- Les cases sont donc REPORTÉES sur « Reçu », qui devient l'étape de départ. Ce que chaque rôle
-- peut faire est identique ; ce qui change, c'est qu'il le fait en une transition au lieu de deux.

INSERT INTO "role_etapes" ("role_id", "parcours_id", "statut_id", "created_at", "updated_at")
SELECT re."role_id", re."parcours_id", recu."id", NOW(), NOW()
  FROM "role_etapes" re
  JOIN "statuts_dossier" affecte ON affecte."id" = re."statut_id" AND affecte."code" = 'affecte'
  CROSS JOIN LATERAL (SELECT "id" FROM "statuts_dossier" WHERE "code" = 'recu') AS recu
ON CONFLICT ("role_id", "parcours_id", "statut_id") DO NOTHING;

-- Puis les cases devenues sans objet : l'étape n'existe plus dans le graphe, une ligne qui la
-- désigne n'autoriserait rien et ferait croire à un paramétrage qui agit.
DELETE FROM "role_etapes"
 WHERE "statut_id" IN (SELECT "id" FROM "statuts_dossier" WHERE "code" = 'affecte');

-- ---------------------------------------------------------------------------------------------
-- 2. L'état sort du circuit, sans sortir de l'histoire
-- ---------------------------------------------------------------------------------------------
--
-- La désactivation est la voie douce, et elle a un effet réel : `transitionsManuelles()` ne
-- propose pas un statut inactif comme destination. Le graphe du code ne le nomme plus non plus —
-- les deux verrous disent la même chose, ce qui est voulu : la base seule ne doit pas pouvoir
-- rouvrir un chemin que le code a fermé.

UPDATE "statuts_dossier"
   SET "actif" = FALSE,
       "updated_at" = NOW()
 WHERE "code" = 'affecte';

COMMIT;
