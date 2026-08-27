<?php

use Database\Seeders\RolePermissionSeeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

it('seeds the 34 permissions defined in docs/acteurs.md §3', function () {
    $this->seed(RolePermissionSeeder::class);

    expect(Permission::count())->toBe(34);
    expect(Permission::where('name', 'dossiers.view.own')->exists())->toBeTrue();
    expect(Permission::where('name', 'audit.view')->exists())->toBeTrue();
});

it('seeds the 15 applicative roles defined in docs/acteurs.md §2', function () {
    // Le déclarant sous-traitant/communauté n'a délibérément aucun rôle (accès public sans
    // compte, cf. acteurs.md §2) : 15 rôles nommés, pas 16 acteurs CDC.
    $this->seed(RolePermissionSeeder::class);

    expect(Role::count())->toBe(15);
});

it('never grants dossiers.* permissions to administrateur_digital (docs/acteurs.md §1, DT-02)', function () {
    $this->seed(RolePermissionSeeder::class);

    $role = Role::findByName('administrateur_digital');

    foreach ($role->permissions as $permission) {
        expect($permission->name)->not->toStartWith('dossiers.');
        expect($permission->name)->not->toStartWith('investigations.');
        expect($permission->name)->not->toStartWith('actions.');
    }
});

it('never grants any audit.update or audit.delete permission to any role (append-only, CDC §15)', function () {
    $this->seed(RolePermissionSeeder::class);

    expect(Permission::where('name', 'audit.update')->exists())->toBeFalse();
    expect(Permission::where('name', 'audit.delete')->exists())->toBeFalse();
});

it('grants dossiers.reopen only to service_mgp and dg (RG-07)', function () {
    $this->seed(RolePermissionSeeder::class);

    $rolesAvecReopen = Permission::findByName('dossiers.reopen')->roles->pluck('name')->sort()->values()->all();

    expect($rolesAvecReopen)->toBe(['dg', 'service_mgp']);
});

it('restricts employe_declarant to viewing only their own dossiers', function () {
    $this->seed(RolePermissionSeeder::class);

    $role = Role::findByName('employe_declarant');
    $permissionNames = $role->permissions->pluck('name')->all();

    expect($permissionNames)->toContain('dossiers.view.own');
    expect($permissionNames)->not->toContain('dossiers.view.all');
    expect($permissionNames)->not->toContain('dossiers.view');
});

it('is idempotent: running the role/permission seeder twice does not duplicate rows', function () {
    $this->seed(RolePermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    expect(Permission::count())->toBe(34);
    expect(Role::count())->toBe(15);
});
