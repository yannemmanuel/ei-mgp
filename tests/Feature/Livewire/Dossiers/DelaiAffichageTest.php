<?php

use App\Enums\ParcoursCode;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use Carbon\CarbonImmutable;

beforeEach(function () {
    seedReferentiels();
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));
});

afterEach(fn () => CarbonImmutable::setTestNow());

it('shows an overdue badge on the dossier list once the étape deadline has passed', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);
    $acteur = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-10 10:00:00'));

    $this->actingAs($gestionnaire)->get(route('dossiers.index'))->assertSee('En retard');
});

it('shows no deadline indicator for a dossier still at Reçu (untracked step)', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $this->actingAs($gestionnaire)->get(route('dossiers.index'))->assertDontSee('En retard');
});

it('shows the overdue badge on the dossier detail page', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);
    $acteur = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-10 10:00:00'));

    $this->actingAs($gestionnaire)->get(route('dossiers.show', $dossier->fresh()))->assertSee('En retard');
});

it('does not flag a provisional (unvalidated) EI delay as overdue on the detail page', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $acteur = User::factory()->create();
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    CarbonImmutable::setTestNow(CarbonImmutable::now()->addMonths(2));

    $this->actingAs($gestionnaire)->get(route('dossiers.show', $dossier->fresh()))->assertDontSee('En retard');
});
