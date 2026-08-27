<?php

use App\Enums\ParcoursCode;
use App\Models\PieceJointe;
use App\Services\Declaration\PieceJointeUploadService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

it('accepts a genuine image within the limits (EX-DEC-06)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $service = app(PieceJointeUploadService::class);

    $service->stocker([UploadedFile::fake()->image('photo.jpg', 200, 200)], $dossier);

    expect(PieceJointe::where('attachable_id', $dossier->id)->count())->toBe(1);
    $piece = PieceJointe::where('attachable_id', $dossier->id)->first();
    expect($piece->mime_type)->toBe('image/jpeg');
    Storage::disk('local')->assertExists($piece->chemin);
});

it('rejects more than 5 files (EX-DEC-06)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $service = app(PieceJointeUploadService::class);

    $fichiers = collect(range(1, 6))->map(fn ($i) => UploadedFile::fake()->image("photo{$i}.jpg"))->all();

    expect(fn () => $service->stocker($fichiers, $dossier))->toThrow(RuntimeException::class);
});

it('rejects a batch exceeding 50 Mo in aggregate (EX-DEC-06)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $service = app(PieceJointeUploadService::class);

    $fichiers = [
        UploadedFile::fake()->create('a.pdf', 30 * 1024, 'application/pdf'),
        UploadedFile::fake()->create('b.pdf', 30 * 1024, 'application/pdf'),
    ];

    expect(fn () => $service->stocker($fichiers, $dossier))->toThrow(RuntimeException::class);
});

it('rejects a file whose real content does not match its extension (docs/exigences-securite.md §3)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $service = app(PieceJointeUploadService::class);

    // "create" génère un fichier dont le contenu réel n'est pas une image, quelle que soit
    // l'extension/le MIME déclaré par le client.
    $fichierDeguise = UploadedFile::fake()->create('photo.jpg', 10, 'image/jpeg');

    expect(fn () => $service->stocker([$fichierDeguise], $dossier))->toThrow(RuntimeException::class);
    expect(PieceJointe::where('attachable_id', $dossier->id)->count())->toBe(0);
});

it('rejects a disallowed file type', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $service = app(PieceJointeUploadService::class);

    $fichier = UploadedFile::fake()->create('script.exe', 10, 'application/x-msdownload');

    expect(fn () => $service->stocker([$fichier], $dossier))->toThrow(RuntimeException::class);
});
