<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Référentiels fonctionnels (parcours, catégories, niveaux de gravité, statuts, sites,
 * directions, canaux de captage) : données requises pour que l'application fonctionne,
 * exécutées dans TOUS les environnements (dev, test, production), contrairement aux comptes
 * de démonstration qui seront ajoutés en Phase 3 (RBAC) via un seeder dédié et guardé par
 * l'environnement (cf. docs/decisions-techniques.md, prompt §36).
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            DirectionSeeder::class,
            SiteSeeder::class,
            ParcoursSeeder::class,
            CanalCaptageSeeder::class,
            NiveauGraviteSeeder::class,
            StatutDossierSeeder::class,
            CategorieSeeder::class,
            RolePermissionSeeder::class,
            DemoUsersSeeder::class,
        ]);
    }
}
