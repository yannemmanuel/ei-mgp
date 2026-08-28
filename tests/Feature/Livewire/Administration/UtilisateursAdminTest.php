<?php

use App\Livewire\Administration\UtilisateursAdmin;
use App\Models\AuditLog;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without users.manage', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('administration.utilisateurs'))->assertForbidden();
});

it('lets administrateur_digital create a user with roles and generates an initial password', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');

    Livewire::actingAs($admin)->test(UtilisateursAdmin::class)
        ->set('name', 'Awa Koffi')
        ->set('email', 'awa.koffi@example.test')
        ->set('rolesSelectionnes', ['secretaire_csst'])
        ->call('enregistrer')
        ->assertHasNoErrors();

    $utilisateur = User::where('email', 'awa.koffi@example.test')->firstOrFail();
    expect($utilisateur->hasRole('secretaire_csst'))->toBeTrue()
        ->and($utilisateur->actif)->toBeTrue();
});

it('rejects a duplicate email', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');
    $existant = User::factory()->create(['email' => 'existe@example.test']);

    Livewire::actingAs($admin)->test(UtilisateursAdmin::class)
        ->set('name', 'Doublon')
        ->set('email', 'existe@example.test')
        ->call('enregistrer')
        ->assertHasErrors(['email']);
});

it('lets administrateur_digital edit a user and update their roles', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');
    $cible = User::factory()->create();
    $cible->assignRole('rqse');

    Livewire::actingAs($admin)->test(UtilisateursAdmin::class)
        ->call('modifier', $cible->id)
        ->set('name', 'Nouveau nom')
        ->set('rolesSelectionnes', ['secretaire_csst'])
        ->call('enregistrer')
        ->assertHasNoErrors();

    $cible->refresh();
    expect($cible->name)->toBe('Nouveau nom')
        ->and($cible->hasRole('rqse'))->toBeFalse()
        ->and($cible->hasRole('secretaire_csst'))->toBeTrue();
});

it('prevents an administrator from deactivating their own account', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');

    Livewire::actingAs($admin)->test(UtilisateursAdmin::class)
        ->call('modifier', $admin->id)
        ->set('actif', false)
        ->call('enregistrer')
        ->assertHasErrors(['actif']);

    expect($admin->fresh()->actif)->toBeTrue();
});

it('audits a role change explicitly (pivot table, outside the generic Observer diff)', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');
    $cible = User::factory()->create();
    $cible->assignRole('rqse');

    Livewire::actingAs($admin)->test(UtilisateursAdmin::class)
        ->call('modifier', $cible->id)
        ->set('rolesSelectionnes', ['secretaire_csst'])
        ->call('enregistrer')
        ->assertHasNoErrors();

    $log = AuditLog::where('action', 'user.roles_modifies')->where('auditable_id', $cible->id)->firstOrFail();
    expect($log->old_values['roles'])->toBe(['rqse'])
        ->and($log->new_values['roles'])->toBe(['secretaire_csst']);
});
