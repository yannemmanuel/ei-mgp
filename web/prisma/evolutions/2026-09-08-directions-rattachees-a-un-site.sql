-- Rattachement des directions à un site.
--
-- « Un secrétaire est habilité par site, et sur un site on peut avoir une ou plusieurs
-- directions » : la relation manquait. `sites` et `directions` étaient deux référentiels
-- indépendants, et `dossiers.site_id` — qui existait déjà — n'était jamais renseigné.
--
-- Purement ADDITIVE : une colonne nullable et sa clé étrangère. Réversible par un DROP COLUMN.
--
-- La colonne reste NULLABLE à dessein. Rendre le rattachement obligatoire d'emblée exigerait de
-- deviner, pour chaque direction existante, à quel site elle appartient — une donnée
-- d'organisation que le code n'a pas à inventer. Une direction sans site produit un dossier sans
-- site, donc invisible des rôles cloisonnés : c'est voulu, et l'écran d'administration le signale.

BEGIN;

ALTER TABLE "directions" ADD COLUMN IF NOT EXISTS "site_id" BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'directions_site_id_foreign'
  ) THEN
    ALTER TABLE "directions"
      ADD CONSTRAINT "directions_site_id_foreign"
      FOREIGN KEY ("site_id") REFERENCES "sites"("id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "directions_site_id_index" ON "directions" ("site_id");

COMMIT;
