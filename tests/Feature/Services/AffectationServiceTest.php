<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Enums\TypeAffectation;
use App\Models\DossierAffectation;
use App\Models\StatutDossier;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use RuntimeException;

beforeEach(fn () => seedReferentiels());

it('deactivates the previous assignee and creates a new active one, tracing the motif (EX-GES-03)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $ancien = User::factory()->create();
    $nouveau = User::factory()->create();
    $chef = User::factory()->create();

    DossierAffectation::factory()->create(['dossier_id' => $dossier->id, 'user_id' => $ancien->id, 'actif' => true]);

    app(AffectationService::class)->reaffecter($dossier, $nouveau, $chef, 'Congé maladie du titulaire.');

    $ancienneAffectation = DossierAffectation::where('dossier_id', $dossier->id)->where('user_id', $ancien->id)->first();
    expect($ancienneAffectation->actif)->toBeFalse();
    expect($ancienneAffectation->desaffecte_le)->not->toBeNull();

    $nouvelleAffectation = DossierAffectation::where('dossier_id', $dossier->id)->where('user_id', $nouveau->id)->where('actif', true)->first();
    expect($nouvelleAffectation)->not->toBeNull();
    expect($nouvelleAffectation->motif)->toBe('Congé maladie du titulaire.');
    expect($nouvelleAffectation->type)->toBe(TypeAffectation::Reaffectation);
    expect($nouvelleAffectation->affecte_par)->toBe($chef->id);
});

it('rejects an empty motif even if a caller bypasses form validation', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $chef = User::factory()->create();

    expect(fn () => app(AffectationService::class)->reaffecter($dossier, User::factory()->create(), $chef, '   '))
        ->toThrow(RuntimeException::class);
});

it('promotes a dossier from Reçu to Affecté when it receives its first manual assignment', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefCommunaute->value);
    expect($dossier->statut->code)->toBe(StatutDossierCode::Recu);

    $chef = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, User::factory()->create(), $chef, 'Prise en charge initiale.');

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Affecte);
});

it('does not change the status when reassigning a dossier already past Reçu', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefCommunaute->value);
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::EnAnalyse->value)->first()->id]);

    $chef = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, User::factory()->create(), $chef, 'Changement de titulaire.');

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::EnAnalyse);
});
