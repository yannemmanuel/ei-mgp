<?php

use App\Models\AuditLog;
use App\Models\Site;
use App\Models\User;

beforeEach(fn () => seedReferentiels());

it('audits the creation of a referentiel model generically', function () {
    $site = Site::create(['code' => 'site_audit', 'libelle' => 'Site audité', 'actif' => true]);

    $log = AuditLog::where('auditable_type', Site::class)->where('auditable_id', $site->id)->where('action', 'site.cree')->first();

    expect($log)->not->toBeNull()
        ->and($log->new_values['libelle'])->toBe('Site audité');
});

it('audits an update with old and new values, excluding updated_at', function () {
    $site = Site::create(['code' => 'site_audit2', 'libelle' => 'Avant', 'actif' => true]);
    $site->update(['libelle' => 'Après']);

    $log = AuditLog::where('auditable_type', Site::class)->where('auditable_id', $site->id)->where('action', 'site.modifie')->first();

    expect($log)->not->toBeNull()
        ->and($log->old_values)->toBe(['libelle' => 'Avant'])
        ->and($log->new_values)->toBe(['libelle' => 'Après'])
        ->and($log->new_values)->not->toHaveKey('updated_at');
});

it('never records a User\'s password or remember_token, even hashed', function () {
    $utilisateur = User::factory()->create(['password' => 'un-mot-de-passe-secret']);

    $log = AuditLog::where('auditable_type', User::class)->where('auditable_id', $utilisateur->id)->where('action', 'user.cree')->firstOrFail();

    expect($log->new_values)->not->toHaveKey('password')
        ->and($log->new_values)->not->toHaveKey('remember_token');
});

it('does not write an audit row when an update leaves no meaningful change', function () {
    $site = Site::create(['code' => 'site_audit3', 'libelle' => 'Stable', 'actif' => true]);
    $compteAvant = AuditLog::count();

    $site->touch();

    expect(AuditLog::count())->toBe($compteAvant);
});
