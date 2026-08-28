<?php

use App\Livewire\Audit\AuditLogViewer;
use App\Models\AuditLog;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without audit.view', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('audit.index'))->assertForbidden();
});

it('lets auditeur, dpo, and service_mgp view the audit log', function () {
    foreach (['auditeur', 'dpo', 'service_mgp'] as $role) {
        $utilisateur = User::factory()->create();
        $utilisateur->assignRole($role);

        $this->actingAs($utilisateur)->get(route('audit.index'))->assertOk();
    }
});

it('filters entries by action', function () {
    $auditeur = User::factory()->create();
    $auditeur->assignRole('auditeur');

    // Action distinctive : seedReferentiels() (Observer sur les référentiels, Phase 11) génère
    // déjà de nombreuses lignes "*.cree"/"*.modifie" — un filtre trop générique se noierait dans
    // ce bruit de fond légitime plutôt que de tester le filtrage lui-même.
    AuditLog::factory()->create(['action' => 'action_test_unique_xyz']);
    AuditLog::factory()->create(['action' => 'auth.connexion']);

    $composant = Livewire::actingAs($auditeur)->test(AuditLogViewer::class)
        ->set('action', 'unique_xyz');

    $actions = $composant->instance()->logs->pluck('action');

    expect($actions)->toContain('action_test_unique_xyz')
        ->not->toContain('auth.connexion');
});
