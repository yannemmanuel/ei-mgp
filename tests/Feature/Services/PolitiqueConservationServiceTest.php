<?php

use App\Enums\ParcoursCode;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Services\Rgpd\PolitiqueConservationService;

beforeEach(fn () => seedReferentiels());

it('archives a dossier clôturé for more than 24 months (RG-11)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['date_cloture' => now()->subMonths(25)]);

    $archives = app(PolitiqueConservationService::class)->archiver();

    expect($archives)->toBe(1)
        ->and($dossier->fresh()->archive_le)->not->toBeNull();
});

it('does not archive a dossier clôturé less than 24 months ago (RG-11)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['date_cloture' => now()->subMonths(23)]);

    $archives = app(PolitiqueConservationService::class)->archiver();

    expect($archives)->toBe(0)
        ->and($dossier->fresh()->archive_le)->toBeNull();
});

it('does not archive a dossier already marked archivé nor a dossier still open (RG-11)', function () {
    $dejaArchive = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dejaArchive->update(['date_cloture' => now()->subMonths(30), 'archive_le' => now()->subMonth()]);

    $ouvert = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $archives = app(PolitiqueConservationService::class)->archiver();

    expect($archives)->toBe(0);
});

it('anonymises a dossier clôturé for more than 10 years by deleting its identité (RG-11)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false, 'date_cloture' => now()->subYears(11)]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id]);

    $anonymises = app(PolitiqueConservationService::class)->anonymiser();

    expect($anonymises)->toBe(1)
        ->and($dossier->fresh()->anonymise_le)->not->toBeNull()
        ->and(DeclarationIdentite::where('dossier_id', $dossier->id)->exists())->toBeFalse()
        ->and(Dossier::find($dossier->id))->not->toBeNull();
});

it('does not anonymise a dossier clôturé for less than 10 years (RG-11)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false, 'date_cloture' => now()->subYears(9)]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id]);

    $anonymises = app(PolitiqueConservationService::class)->anonymiser();

    expect($anonymises)->toBe(0)
        ->and(DeclarationIdentite::where('dossier_id', $dossier->id)->exists())->toBeTrue();
});

it('excludes a dossier marked contentieux from automatic anonymisation (RG-11)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false, 'date_cloture' => now()->subYears(11), 'contentieux' => true]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id]);

    $service = app(PolitiqueConservationService::class);

    expect($service->anonymiser())->toBe(0)
        ->and($service->compterExclusPourContentieux())->toBe(1)
        ->and(DeclarationIdentite::where('dossier_id', $dossier->id)->exists())->toBeTrue();
});
