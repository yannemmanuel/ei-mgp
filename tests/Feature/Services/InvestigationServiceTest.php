<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutInvestigation;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use App\Services\Investigation\InvestigationService;
use Carbon\CarbonImmutable;

beforeEach(function () {
    seedReferentiels();
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));
});

afterEach(fn () => CarbonImmutable::setTestNow());

/**
 * ParcoursFactory génère un code parmi les 4 valeurs de ParcoursCode (docs de la factory) :
 * incompatible avec seedReferentiels() déjà exécuté (contrainte unique parcours.code). Toute
 * Investigation créée hors du scénario "ouvrir" doit donc être rattachée à un dossier réel.
 */
function dossierQuelconque(): Dossier
{
    return createTestDossierForParcours(ParcoursCode::EiEmploye->value);
}

it('opens an investigation once the dossier is "en investigation" (EX-INV-01)', function () {
    $enqueteur = User::factory()->create();
    $dossier = amenerDossierEnInvestigation(ParcoursCode::EiEmploye->value, $enqueteur);

    $investigation = app(InvestigationService::class)->ouvrir($dossier, $enqueteur, [
        'date_ouverture' => '2026-08-28',
        'faits_constates' => 'Constats détaillés de l\'enquête sur site.',
        'personnes_rencontrees' => null,
        'cause_immediate' => null,
        'causes_racines' => null,
        'recommandations' => 'Renforcer la signalisation de la zone concernée.',
    ]);

    expect($investigation->exists)->toBeTrue()
        ->and($investigation->dossier_id)->toBe($dossier->id)
        ->and($investigation->enqueteur_id)->toBe($enqueteur->id)
        ->and($investigation->statut)->toBe(StatutInvestigation::EnCours);
});

it('refuses to open an investigation on a dossier that is not "en investigation" (EX-INV-01)', function () {
    $acteur = User::factory()->create();
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');
    // Reste à "Affecté", jamais amené jusqu'à "En investigation".

    expect(fn () => app(InvestigationService::class)->ouvrir($dossier->fresh(), $acteur, [
        'date_ouverture' => '2026-08-28',
        'faits_constates' => 'Constats.',
        'personnes_rencontrees' => null,
        'cause_immediate' => null,
        'causes_racines' => null,
        'recommandations' => 'Recommandations.',
    ]))->toThrow(RuntimeException::class);
});

it('refuses a date d\'ouverture antérieure à la date de recevabilité du dossier (RGI-05)', function () {
    $enqueteur = User::factory()->create();
    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $enqueteur);

    expect(fn () => app(InvestigationService::class)->ouvrir($dossier, $enqueteur, [
        'date_ouverture' => '2026-08-27', // veille de l'entrée en "En investigation".
        'faits_constates' => 'Constats.',
        'personnes_rencontrees' => null,
        'cause_immediate' => null,
        'causes_racines' => null,
        'recommandations' => 'Recommandations.',
    ]))->toThrow(RuntimeException::class);
});

it('refuses to update an investigation that is no longer "en cours"', function () {
    $investigation = Investigation::factory()->create([
        'dossier_id' => dossierQuelconque()->id,
        'statut' => StatutInvestigation::EnAttenteValidation->value,
    ]);

    expect(fn () => app(InvestigationService::class)->mettreAJour($investigation, [
        'faits_constates' => 'Nouveaux faits.',
        'personnes_rencontrees' => null,
        'cause_immediate' => null,
        'causes_racines' => null,
        'recommandations' => 'Nouvelles recommandations.',
    ]))->toThrow(RuntimeException::class);
});

it('transitions "en cours" to "en attente de validation" on submission', function () {
    $investigation = Investigation::factory()->create([
        'dossier_id' => dossierQuelconque()->id,
        'statut' => StatutInvestigation::EnCours->value,
    ]);

    app(InvestigationService::class)->soumettrePourValidation($investigation);

    expect($investigation->fresh()->statut)->toBe(StatutInvestigation::EnAttenteValidation);
});

it('refuses submission for validation without recommandations (EX-INV-04)', function () {
    $investigation = Investigation::factory()->create([
        'dossier_id' => dossierQuelconque()->id,
        'statut' => StatutInvestigation::EnCours->value,
        'recommandations' => '   ',
    ]);

    expect(fn () => app(InvestigationService::class)->soumettrePourValidation($investigation))
        ->toThrow(RuntimeException::class);
});

it('refuses la validation par l\'enquêteur lui-même (RGI-06)', function () {
    $enqueteur = User::factory()->create();
    $investigation = Investigation::factory()->create([
        'dossier_id' => dossierQuelconque()->id,
        'enqueteur_id' => $enqueteur->id,
        'statut' => StatutInvestigation::EnAttenteValidation->value,
    ]);

    expect(fn () => app(InvestigationService::class)->valider($investigation, $enqueteur))
        ->toThrow(RuntimeException::class);
});

it('valide une investigation par un acteur distinct de l\'enquêteur', function () {
    $enqueteur = User::factory()->create();
    $validateur = User::factory()->create();
    $investigation = Investigation::factory()->create([
        'dossier_id' => dossierQuelconque()->id,
        'enqueteur_id' => $enqueteur->id,
        'statut' => StatutInvestigation::EnAttenteValidation->value,
    ]);

    app(InvestigationService::class)->valider($investigation, $validateur);

    $frais = $investigation->fresh();
    expect($frais->statut)->toBe(StatutInvestigation::Validee)
        ->and($frais->valide_par)->toBe($validateur->id)
        ->and($frais->valide_le)->not->toBeNull();
});

it('refuses de valider une investigation qui n\'est pas en attente de validation', function () {
    $investigation = Investigation::factory()->create([
        'dossier_id' => dossierQuelconque()->id,
        'statut' => StatutInvestigation::EnCours->value,
    ]);
    $validateur = User::factory()->create();

    expect(fn () => app(InvestigationService::class)->valider($investigation, $validateur))
        ->toThrow(RuntimeException::class);
});
