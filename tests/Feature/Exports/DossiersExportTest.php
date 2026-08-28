<?php

use App\Enums\ParcoursCode;
use App\Exports\DossiersExport;
use App\Models\DeclarationIdentite;
use App\Models\Parcours;
use App\Support\ReportingFilter;

beforeEach(fn () => seedReferentiels());

it('excludes nominative columns by default (EX-REP-06)', function () {
    createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $export = new DossiersExport(new ReportingFilter);

    expect($export->headings())->not->toContain('Nom du déclarant');
    expect($export->query()->count())->toBe(1);
});

it('includes nominative columns and their values only when explicitly requested', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id, 'nom_prenom' => 'Awa Koffi']);

    $export = new DossiersExport(new ReportingFilter, inclureNominatif: true);

    expect($export->headings())->toContain('Nom du déclarant');

    $ligne = $export->map($dossier->fresh(['identite']));
    expect($ligne)->toContain('Awa Koffi');
});

it('applies the ReportingFilter to the underlying query', function () {
    createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();
    $export = new DossiersExport(new ReportingFilter(parcoursId: (string) $parcours->id));

    expect($export->query()->count())->toBe(1);
});
