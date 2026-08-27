<?php

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoUsersSeeder;
use Database\Seeders\RolePermissionSeeder;

it('creates the 6 demo accounts requested by the prompt, each with the correct role', function () {
    $this->seed(DatabaseSeeder::class);

    $attendus = [
        'admin@example.test' => 'administrateur_digital',
        'gestionnaire@example.test' => 'service_mgp',
        'superviseur@example.test' => 'secretaire_csst',
        'enqueteur@example.test' => 'correspondant_mgp',
        'direction@example.test' => 'dg',
        'auditeur@example.test' => 'auditeur',
    ];

    foreach ($attendus as $email => $role) {
        $user = User::where('email', $email)->firstOrFail();
        expect($user->hasRole($role))->toBeTrue("L'utilisateur {$email} devrait avoir le rôle {$role}.");
    }
});

it('never runs when the application environment is production', function () {
    $this->seed(RolePermissionSeeder::class);
    $this->app['env'] = 'production';

    // Instanciation directe : $this->seed() passerait par la commande Artisan db:seed, dont le
    // ConfirmableTrait interrompt lui-même l'exécution en environnement "production" — ce n'est
    // pas ce qu'on veut tester ici (on teste le garde-fou interne à DemoUsersSeeder, pas celui
    // d'Artisan).
    (new DemoUsersSeeder)->run();

    expect(User::where('email', 'admin@example.test')->exists())->toBeFalse();
});

it('is idempotent: running the demo seeder twice does not duplicate accounts', function () {
    $this->seed(RolePermissionSeeder::class);

    $this->seed(DemoUsersSeeder::class);
    $this->seed(DemoUsersSeeder::class);

    expect(User::where('email', 'admin@example.test')->count())->toBe(1);
});
