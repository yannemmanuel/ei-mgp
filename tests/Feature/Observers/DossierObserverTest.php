<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use App\Services\Workflow\DossierWorkflowService;

beforeEach(fn () => seedReferentiels());

it('audits dossier field changes other than statut_id', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $dossier->update(['lieu' => 'Nouvel emplacement']);

    $log = AuditLog::where('auditable_type', $dossier::class)
        ->where('auditable_id', $dossier->id)
        ->where('action', 'dossier.modifie')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->new_values)->toBe(['lieu' => 'Nouvel emplacement']);
});

it('does not duplicate a statut_id-only change already covered by dossier.statut_change', function () {
    $acteur = User::factory()->create();
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');
    app(DossierWorkflowService::class)->changerStatut($dossier->fresh(), StatutDossierCode::EnAnalyse, $acteur);

    $doublon = AuditLog::where('auditable_type', $dossier::class)
        ->where('auditable_id', $dossier->id)
        ->where('action', 'dossier.modifie')
        ->whereJsonContains('new_values', ['statut_id' => $dossier->fresh()->statut_id])
        ->exists();

    $viaEvenement = AuditLog::where('auditable_type', $dossier::class)
        ->where('auditable_id', $dossier->id)
        ->where('action', 'dossier.statut_change')
        ->exists();

    expect($doublon)->toBeFalse()
        ->and($viaEvenement)->toBeTrue();
});
