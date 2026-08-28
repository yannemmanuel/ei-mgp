<?php

use App\Enums\ParcoursCode;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Audit\AuditLogger;

beforeEach(fn () => seedReferentiels());

it('records an INSERT-only row with the acting user, action, and auditable reference', function () {
    $acteur = User::factory()->create();
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    app(AuditLogger::class)->enregistrer('test.action', $dossier, ['a' => 1], ['a' => 2], $acteur);

    $log = AuditLog::where('action', 'test.action')->firstOrFail();
    expect($log->user_id)->toBe($acteur->id)
        ->and($log->auditable_type)->toBe($dossier::class)
        ->and($log->auditable_id)->toBe($dossier->id)
        ->and($log->old_values)->toBe(['a' => 1])
        ->and($log->new_values)->toBe(['a' => 2]);
});

it('falls back to the currently authenticated user when no acteur is given', function () {
    $utilisateur = User::factory()->create();
    $this->actingAs($utilisateur);

    app(AuditLogger::class)->enregistrer('test.sans_acteur');

    $log = AuditLog::where('action', 'test.sans_acteur')->firstOrFail();
    expect($log->user_id)->toBe($utilisateur->id);
});

it('never allows updating or deleting an audit_logs row (append-only)', function () {
    $log = AuditLog::factory()->create();

    expect(fn () => $log->update(['action' => 'modifie']))->toThrow(LogicException::class);
    expect(fn () => $log->delete())->toThrow(LogicException::class);
});
