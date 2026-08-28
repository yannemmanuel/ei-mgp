<?php

use App\Enums\EtapeDelai;
use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Models\SlaDelai;
use App\Models\StatutDossier;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use App\Services\Workflow\DelaiService;
use App\Services\Workflow\DossierWorkflowService;
use Carbon\CarbonImmutable;

beforeEach(function () {
    seedReferentiels();
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00')); // vendredi
});

afterEach(fn () => CarbonImmutable::setTestNow());

it('maps each trackable status to its étape and returns null for untracked statuses', function () {
    $delai = app(DelaiService::class);

    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Affecte->value)->first()->id]);
    expect($delai->etapeActuelle($dossier->fresh()))->toBe(EtapeDelai::AnalysePreliminaire);

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::EnInvestigation->value)->first()->id]);
    expect($delai->etapeActuelle($dossier->fresh()))->toBe(EtapeDelai::TraitementEnquete);

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::ActionCorrectiveEnCours->value)->first()->id]);
    expect($delai->etapeActuelle($dossier->fresh()))->toBe(EtapeDelai::MiseEnOeuvreMesures);

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Resolu->value)->first()->id]);
    expect($delai->etapeActuelle($dossier->fresh()))->toBe(EtapeDelai::RetourResolution);

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Recu->value)->first()->id]);
    expect($delai->etapeActuelle($dossier->fresh()))->toBeNull();
});

it('never computes a deadline for a provisional (non-validated) delay, per DT-04', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    app(AffectationService::class)->reaffecter($dossier, User::factory()->create(), User::factory()->create(), 'Prise en charge.');

    // EI "analyse_preliminaire" est marqué est_valide_metier=false (CDC §1.8 point 4).
    $ligne = SlaDelai::where('parcours_id', $dossier->parcours_id)->where('etape_code', 'analyse_preliminaire')->first();
    expect($ligne->est_valide_metier)->toBeFalse();

    expect(app(DelaiService::class)->dateLimite($dossier->fresh()))->toBeNull();
    expect(app(DelaiService::class)->estEnRetard($dossier->fresh()))->toBeFalse();
});

it('computes the deadline in jours_ouvres, skipping weekends', function () {
    // Grief Employé "analyse_preliminaire" = 3 jours ouvrés, validé.
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);
    $acteur = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    // Départ vendredi 28/08/2026 10h -> +3 jours ouvrés = lundi, mardi, mercredi -> mercredi 02/09/2026 10h.
    $limite = app(DelaiService::class)->dateLimite($dossier->fresh());

    expect($limite->toDateString())->toBe('2026-09-02');
});

it('reports a negative jours restants once the deadline has passed', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);
    $acteur = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-05 10:00:00'));

    $delaiService = app(DelaiService::class);
    expect($delaiService->estEnRetard($dossier->fresh()))->toBeTrue();
    expect($delaiService->joursRestants($dossier->fresh()))->toBeLessThan(0);
});

it('reports a positive jours restants before the deadline', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);
    $acteur = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    $delaiService = app(DelaiService::class);
    expect($delaiService->estEnRetard($dossier->fresh()))->toBeFalse();
    expect($delaiService->joursRestants($dossier->fresh()))->toBeGreaterThan(0);
});

it('measures the deadline for the current étape from the most recent entry into that phase', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefSousTraitant->value);
    $acteur = User::factory()->create();
    $workflow = app(DossierWorkflowService::class);

    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');
    $workflow->changerStatut($dossier->fresh(), StatutDossierCode::EnAnalyse, $acteur);

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-31 09:00:00'));
    $workflow->changerStatut($dossier->fresh(), StatutDossierCode::EnInvestigation, $acteur);

    // Grief Sous-traitant "traitement_enquete" = 2 semaines à partir de l'entrée en investigation.
    $limite = app(DelaiService::class)->dateLimite($dossier->fresh());

    expect($limite->toDateString())->toBe('2026-09-14');
});

it('flags a dossier as globally overdue past the overall cloture deadline (§11.2), but never once closed', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    CarbonImmutable::setTestNow(CarbonImmutable::now()->addMonths(7));
    $delaiService = app(DelaiService::class);
    expect($delaiService->estEnRetardGlobalement($dossier->fresh()))->toBeTrue();

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Cloture->value)->first()->id]);
    expect($delaiService->estEnRetardGlobalement($dossier->fresh()))->toBeFalse();
});
