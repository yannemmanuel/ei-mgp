-- Adresses e-mail des comptes ramenées en minuscules.
--
-- La console d'administration enregistrait l'adresse telle que saisie (« Adama.Bamba@sodeci.ci »)
-- alors que la connexion la cherchait en minuscules : ces comptes répondaient « Identifiants
-- invalides » à chaque tentative. La connexion compare désormais sans tenir compte de la casse ;
-- cette reprise aligne les données pour que tous les autres usages voient la même adresse.
--
-- ⚠️ Une ligne n'est PAS modifiée si une autre ne diffère d'elle que par la casse : la contrainte
-- d'unicité refuserait la mise à jour, et choisir entre deux comptes relève d'un administrateur.
-- La requête de contrôle en fin de fichier les liste.

UPDATE "ei_mgp"."users" AS u
SET "email" = lower(trim(u."email")),
    "updated_at" = CURRENT_TIMESTAMP
WHERE u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1
    FROM "ei_mgp"."users" AS v
    WHERE v."id" <> u."id"
      AND lower(trim(v."email")) = lower(trim(u."email"))
  );

-- Contrôle (lecture seule) : comptes restés en doublon à la casse près, à départager à la main.
-- SELECT lower(trim("email")) AS adresse, array_agg("id" ORDER BY "id") AS comptes
-- FROM "ei_mgp"."users"
-- GROUP BY lower(trim("email"))
-- HAVING count(*) > 1;
