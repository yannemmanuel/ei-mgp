<?php

use App\Enums\ParcoursCode;
use App\Services\Declaration\ReferenceGeneratorService;
use Illuminate\Support\Facades\DB;

beforeEach(fn () => seedReferentiels());

it('generates a reference in the RG-01 format for each parcours prefix', function () {
    $service = app(ReferenceGeneratorService::class);

    $attendus = [
        ParcoursCode::EiEmploye->value => 'EI',
        ParcoursCode::GriefEmploye->value => 'GEM',
        ParcoursCode::GriefSousTraitant->value => 'GST',
        ParcoursCode::GriefCommunaute->value => 'GCO',
    ];

    foreach ($attendus as $code => $prefixe) {
        $reference = DB::transaction(fn () => $service->suivante(ParcoursCode::from($code)));

        expect($reference)->toMatch('/^'.$prefixe.'-'.now()->year.'-\d{6}$/');
    }
});

it('increments the sequence per parcours independently', function () {
    $service = app(ReferenceGeneratorService::class);

    $premiereEi = DB::transaction(function () use ($service) {
        $ref = $service->suivante(ParcoursCode::EiEmploye);
        createTestDossierForParcours(ParcoursCode::EiEmploye->value)->update(['reference' => $ref]);

        return $ref;
    });

    $deuxiemeEi = DB::transaction(function () use ($service) {
        $ref = $service->suivante(ParcoursCode::EiEmploye);
        createTestDossierForParcours(ParcoursCode::EiEmploye->value)->update(['reference' => $ref]);

        return $ref;
    });

    $premiereGrief = DB::transaction(fn () => $service->suivante(ParcoursCode::GriefEmploye));

    expect(substr($premiereEi, -6))->toBe('000001');
    expect(substr($deuxiemeEi, -6))->toBe('000002');
    expect(substr($premiereGrief, -6))->toBe('000001');
});
