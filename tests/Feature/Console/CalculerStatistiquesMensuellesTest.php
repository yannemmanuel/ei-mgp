<?php

use App\Enums\ParcoursCode;
use App\Models\StatistiqueMensuelle;
use Carbon\CarbonImmutable;

beforeEach(fn () => seedReferentiels());

afterEach(fn () => CarbonImmutable::setTestNow());

it('defaults to computing the previous month when --mois is omitted (EX-REP-05)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-15 10:00:00'));

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-07-10 10:00:00'));
    createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-15 10:00:00'));

    $this->artisan('rapports:calculer-statistiques-mensuelles')->assertSuccessful();

    expect(StatistiqueMensuelle::where('periode', '2026-07-01')->exists())->toBeTrue();
});

it('computes a specific month when --mois is given', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-03-05 10:00:00'));
    createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-15 10:00:00'));

    $this->artisan('rapports:calculer-statistiques-mensuelles', ['--mois' => '2026-03'])->assertSuccessful();

    expect(StatistiqueMensuelle::where('periode', '2026-03-01')->exists())->toBeTrue();
});
