<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Comptes de démonstration (prompt §31). Mot de passe de développement : "password" — jamais
 * un mot de passe réel, jamais utilisé en production (cf. run() ci-dessous).
 *
 * Correspondance avec les rôles CDC (docs/acteurs.md) :
 *   admin@example.test       -> administrateur_digital (Administrateur digital / fonctionnel)
 *   gestionnaire@example.test-> service_mgp             (Service MGP / DADD)
 *   superviseur@example.test -> secretaire_csst          (Secrétaire CSST / Comité SST)
 *   enqueteur@example.test   -> correspondant_mgp        (Correspondant MGP / Enquêteur)
 *   direction@example.test   -> dg                       (Direction Générale)
 *   auditeur@example.test    -> auditeur                 (Auditeur)
 */
class DemoUsersSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('DemoUsersSeeder ignoré : environnement de production.');

            return;
        }

        $comptes = [
            ['name' => 'Administrateur Digital', 'email' => 'admin@example.test', 'role' => 'administrateur_digital'],
            ['name' => 'Gestionnaire MGP/DADD', 'email' => 'gestionnaire@example.test', 'role' => 'service_mgp'],
            ['name' => 'Superviseur CSST', 'email' => 'superviseur@example.test', 'role' => 'secretaire_csst'],
            ['name' => 'Enquêteur MGP', 'email' => 'enqueteur@example.test', 'role' => 'correspondant_mgp'],
            ['name' => 'Direction Générale', 'email' => 'direction@example.test', 'role' => 'dg'],
            ['name' => 'Auditeur', 'email' => 'auditeur@example.test', 'role' => 'auditeur'],
        ];

        foreach ($comptes as $compte) {
            $user = User::query()->updateOrCreate(
                ['email' => $compte['email']],
                [
                    'name' => $compte['name'],
                    'password' => 'password',
                    'actif' => true,
                    'email_verified_at' => now(),
                ]
            );

            $user->syncRoles([$compte['role']]);
        }
    }
}
