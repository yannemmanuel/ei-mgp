<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Models\Dossier;
use App\Models\Parcours;
use App\Models\StatutDossier;
use App\Services\Reporting\IndicateurService;
use App\Support\ReportingFilter;
use Carbon\CarbonImmutable;

beforeEach(fn () => seedReferentiels());

afterEach(fn () => CarbonImmutable::setTestNow());

function dossierAvecStatut(string $parcoursCode, StatutDossierCode $code): Dossier
{
    $dossier = createTestDossierForParcours($parcoursCode);
    $dossier->update(['statut_id' => StatutDossier::where('code', $code->value)->firstOrFail()->id]);

    return $dossier->fresh();
}

it('counts declarations matching the filter (EX-REP-02/03)', function () {
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);
    dossierAvecStatut(ParcoursCode::GriefEmploye->value, StatutDossierCode::Recu);

    $service = app(IndicateurService::class);

    expect($service->nbDeclarations(new ReportingFilter))->toBe(2);

    $parcoursEi = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();
    expect($service->nbDeclarations(new ReportingFilter(parcoursId: (string) $parcoursEi->id)))->toBe(1);
});

it('computes the taux de résolution and taux de clôture correctly (DT-31)', function () {
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Resolu);
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Cloture);
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Rejete);

    $service = app(IndicateurService::class);
    $filtre = new ReportingFilter;

    // Résolus : Résolu + Clôturé = 2/4 = 50 %.
    expect($service->tauxResolution($filtre))->toBe(50.0);
    // Terminaux (RGI-11) : Clôturé + Rejeté = 2/4 = 50 %.
    expect($service->tauxCloture($filtre))->toBe(50.0);
});

it('returns null indicators when there are no matching dossiers', function () {
    $service = app(IndicateurService::class);
    $filtre = new ReportingFilter;

    expect($service->tauxResolution($filtre))->toBeNull()
        ->and($service->tauxCloture($filtre))->toBeNull()
        ->and($service->delaiMoyenJours($filtre))->toBeNull();
});

it('computes the average delay in days from creation to clôture, closed dossiers only', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-01 10:00:00'));
    $dossier = dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Cloture);
    $dossier->update(['date_cloture' => CarbonImmutable::parse('2026-08-11 10:00:00')]);

    // Un second dossier jamais clôturé ne doit pas fausser la moyenne.
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);

    expect(app(IndicateurService::class)->delaiMoyenJours(new ReportingFilter))->toBe(10.0);
});

it('breaks down declarations by parcours, statut, and gravité', function () {
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);
    dossierAvecStatut(ParcoursCode::GriefEmploye->value, StatutDossierCode::Recu);

    $service = app(IndicateurService::class);
    $filtre = new ReportingFilter;

    $parParcours = $service->repartitionParParcours($filtre)->pluck('total', 'libelle');
    expect($parParcours->sum())->toBe(3);

    $parStatut = $service->repartitionParStatut($filtre);
    expect($parStatut->sum('total'))->toBe(3);

    $parGravite = $service->repartitionParGravite($filtre);
    expect($parGravite->sum('total'))->toBe(3);
});

it('filters the date range by création date (periodeDebut/periodeFin)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-01-15 10:00:00'));
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);

    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-06-15 10:00:00'));
    dossierAvecStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Recu);

    $service = app(IndicateurService::class);

    expect($service->nbDeclarations(new ReportingFilter(periodeDebut: '2026-06-01')))->toBe(1)
        ->and($service->nbDeclarations(new ReportingFilter(periodeFin: '2026-02-01')))->toBe(1)
        ->and($service->nbDeclarations(new ReportingFilter))->toBe(2);
});
