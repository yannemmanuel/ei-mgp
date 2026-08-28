<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Models\StatistiqueMensuelle;
use App\Models\StatutDossier;
use App\Services\Reporting\StatistiqueMensuelleService;
use Carbon\CarbonImmutable;

beforeEach(fn () => seedReferentiels());

afterEach(fn () => CarbonImmutable::setTestNow());

it('archives one row per combinaison parcours × catégorie × gravité for the given month (EX-REP-05)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-07-10 10:00:00'));
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Cloture->value)->firstOrFail()->id]);

    $creees = app(StatistiqueMensuelleService::class)->calculerPour(CarbonImmutable::parse('2026-07-01'));

    expect($creees)->toBe(1);

    $ligne = StatistiqueMensuelle::where('periode', '2026-07-01')->firstOrFail();
    expect($ligne->parcours_id)->toBe($dossier->parcours_id)
        ->and($ligne->nb_declarations)->toBe(1)
        ->and($ligne->nb_cloturees)->toBe(1)
        ->and((float) $ligne->taux_cloture)->toBe(100.0);

    // Aucune donnée d'identité, aucune référence de dossier individuel (RG-12).
    expect($ligne->getAttributes())->not->toHaveKey('dossier_id')
        ->and($ligne->getAttributes())->not->toHaveKey('reference');
});

it('never overwrites an already-computed period (append-only, no updateOrCreate)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-07-10 10:00:00'));
    createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $service = app(StatistiqueMensuelleService::class);
    $service->calculerPour(CarbonImmutable::parse('2026-07-01'));
    $ligne = StatistiqueMensuelle::firstOrFail();
    $idOriginal = $ligne->id;

    // Un second dossier créé après coup ne doit jamais modifier la ligne déjà archivée.
    createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $secondAppel = $service->calculerPour(CarbonImmutable::parse('2026-07-01'));

    expect($secondAppel)->toBe(0)
        ->and(StatistiqueMensuelle::count())->toBe(1)
        ->and(StatistiqueMensuelle::first()->id)->toBe($idOriginal)
        ->and(StatistiqueMensuelle::first()->nb_declarations)->toBe(1);
});
