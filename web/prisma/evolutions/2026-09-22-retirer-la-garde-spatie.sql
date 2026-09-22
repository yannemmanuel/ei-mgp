-- Retirer `guard_name`, dernier concept de spatie/laravel-permission dans le schéma.
--
-- ⚠️ CE QUE CETTE COLONNE FAISAIT, ET POURQUOI ELLE NE FAIT PLUS RIEN. La « garde » de Spatie
-- sépare plusieurs systèmes d'authentification coexistant dans une même application Laravel :
-- `web` pour les sessions, `api` pour les jetons, chacun avec son jeu de rôles. Le même nom de
-- rôle pouvait alors désigner deux choses selon la porte d'entrée.
--
-- Cette application n'a qu'une authentification. Les 18 rôles et les 36 permissions portent tous
-- `web`, et rien ne peut en créer d'autres : la valeur est écrite en dur à chaque insertion. Le
-- code filtrait donc sur une colonne dont il venait lui-même de garantir la valeur — une
-- quarantaine de `guard_name: GUARD` qui n'excluaient jamais une seule ligne.
--
-- ⚠️ UNE CÉRÉMONIE N'EST PAS NEUTRE. Un filtre qui ne filtre rien se lit comme un filtre qui
-- protège : un relecteur cherchant « les rôles sont-ils cloisonnés ? » trouvait une condition à
-- chaque requête et concluait que oui. Et l'oublier UNE fois, dans une requête nouvelle, aurait
-- produit une incohérence invisible entre deux chemins censés lire la même chose.
--
-- ⚠️ L'UNICITÉ SE RESSERRE, ELLE NE SE RELÂCHE PAS. `UNIQUE (name, guard_name)` devient
-- `UNIQUE (name)` : deux rôles de même nom, aujourd'hui possibles sous deux gardes différentes,
-- deviennent impossibles. Les index sont donc créés AVANT que la colonne ne disparaisse, pour que
-- la contrainte ne soit jamais levée, même le temps d'une instruction.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Vérifier avant d'agir
-- ---------------------------------------------------------------------------------------------
--
-- Si une garde autre que `web` existait, la nouvelle unicité sur le seul nom échouerait — mais
-- elle échouerait sur une contrainte, sans dire pourquoi. Ce contrôle le dit.

DO $$
DECLARE autres integer;
BEGIN
  SELECT count(*) INTO autres FROM "roles" WHERE "guard_name" <> 'web';
  IF autres > 0 THEN
    RAISE EXCEPTION 'ABANDON : % rôle(s) portent une garde autre que « web ». Leur retrait fusionnerait des rôles distincts.', autres;
  END IF;

  SELECT count(*) INTO autres FROM "permissions" WHERE "guard_name" <> 'web';
  IF autres > 0 THEN
    RAISE EXCEPTION 'ABANDON : % permission(s) portent une garde autre que « web ».', autres;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Resserrer l'unicité, puis retirer la colonne
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "roles"       ADD CONSTRAINT "roles_name_unique"       UNIQUE ("name");
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_name_unique" UNIQUE ("name");

ALTER TABLE "roles"       DROP CONSTRAINT "roles_name_guard_name_unique";
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_name_guard_name_unique";

ALTER TABLE "roles"       DROP COLUMN "guard_name";
ALTER TABLE "permissions" DROP COLUMN "guard_name";

COMMIT;
