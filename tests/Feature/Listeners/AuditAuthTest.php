<?php

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

beforeEach(fn () => seedReferentiels());

it('audits a login (DT-08)', function () {
    $utilisateur = User::factory()->create();

    event(new Login('web', $utilisateur, false));

    expect(AuditLog::where('action', 'auth.connexion')->where('user_id', $utilisateur->id)->exists())->toBeTrue();
});

it('audits a logout (DT-08)', function () {
    $utilisateur = User::factory()->create();

    event(new Logout('web', $utilisateur));

    expect(AuditLog::where('action', 'auth.deconnexion')->where('user_id', $utilisateur->id)->exists())->toBeTrue();
});
