-- À appliquer dans la base cible avant de déployer le nouveau catalogue.
-- Les définitions historiques restent lisibles ; seules leurs attributions sont retirées.
BEGIN;

INSERT INTO "ei_mgp"."permissions" ("name", "created_at", "updated_at")
SELECT 'plan_actions.view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "ei_mgp"."permissions" WHERE "name" = 'plan_actions.view'
);

INSERT INTO "ei_mgp"."role_has_permissions" ("permission_id", "role_id")
SELECT cible."id", attribution."role_id"
FROM "ei_mgp"."role_has_permissions" attribution
JOIN "ei_mgp"."permissions" source ON source."id" = attribution."permission_id"
JOIN "ei_mgp"."permissions" cible ON cible."name" = 'plan_actions.view'
WHERE source."name" = 'actions.view'
ON CONFLICT DO NOTHING;

INSERT INTO "ei_mgp"."model_has_permissions" ("permission_id", "model_type", "model_id")
SELECT cible."id", attribution."model_type", attribution."model_id"
FROM "ei_mgp"."model_has_permissions" attribution
JOIN "ei_mgp"."permissions" source ON source."id" = attribution."permission_id"
JOIN "ei_mgp"."permissions" cible ON cible."name" = 'plan_actions.view'
WHERE source."name" = 'actions.view'
ON CONFLICT DO NOTHING;

DELETE FROM "ei_mgp"."role_has_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "ei_mgp"."permissions"
  WHERE "name" IN ('dossiers.assign', 'dossiers.reassign', 'investigations.validate', 'rgpd.acces.view')
);

DELETE FROM "ei_mgp"."model_has_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "ei_mgp"."permissions"
  WHERE "name" IN ('dossiers.assign', 'dossiers.reassign', 'investigations.validate', 'rgpd.acces.view')
);

COMMIT;
