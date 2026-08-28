<?php

use App\Enums\CanalCaptageCode;
use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Events\DeclarationCritique;
use App\Events\DeclarationSoumise;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\HistoriqueStatut;
use App\Models\NiveauGravite;
use App\Models\User;
use App\Services\Declaration\DeclarationService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

it('creates a complete dossier and returns its reference (RG-01, EX-DEC-08)', function () {
    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    $resultat = app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: false,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: ['nom_prenom' => 'Awa Koffi'],
    );

    expect($resultat['dossier'])->toBeInstanceOf(Dossier::class);
    expect($resultat['dossier']->reference)->toMatch('/^EI-\d{4}-\d{6}$/');
    // EX-NOT-06 / docs/exigences-securite.md §4 : /suivi exige toujours référence + code d'accès,
    // même pour un dossier non anonyme (cf. docs/decisions-techniques.md DT-28).
    expect($resultat['code_acces'])->toMatch('/^\d{6}$/');
});

it('never creates a declaration_identites row for an anonymous declaration and generates an access code (RG-06, RG-02)', function () {
    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    $resultat = app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: ['nom_prenom' => 'Ne devrait jamais être stocké'],
    );

    $dossier = $resultat['dossier'];

    expect($dossier->is_anonymous)->toBeTrue();
    expect($dossier->declarant_user_id)->toBeNull();
    expect(DeclarationIdentite::where('dossier_id', $dossier->id)->exists())->toBeFalse();
    expect($resultat['code_acces'])->toMatch('/^\d{6}$/');
    expect($dossier->access_code_hash)->not->toBeNull();
    expect($dossier->access_code_hash)->not->toBe($resultat['code_acces']);
});

it('auto-assigns the dossier to the roles responsible for capturing this parcours (EX-GES-02) and moves it to Affecté', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');
    $secretaire = User::factory()->create();
    $secretaire->assignRole('secretaire_csst');
    // Un utilisateur non pertinent pour ce parcours ne doit jamais être affecté.
    $autre = User::factory()->create();
    $autre->assignRole('correspondant_mgp');

    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    $resultat = app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: [],
    );

    $dossier = $resultat['dossier'];
    $assignes = DossierAffectation::where('dossier_id', $dossier->id)->pluck('user_id')->sort()->values()->all();

    expect($assignes)->toBe(collect([$rqse->id, $secretaire->id])->sort()->values()->all());
    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Affecte);
});

it('leaves the dossier at Reçu when no user holds the capture role for this parcours', function () {
    $categorie = categorieDe(ParcoursCode::GriefCommunaute->value);

    $resultat = app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::GriefCommunaute,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Village',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: [],
    );

    expect($resultat['dossier']->fresh()->statut->code)->toBe(StatutDossierCode::Recu);
});

it('records the initial historique_statuts entry', function () {
    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    $resultat = app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: [],
    );

    expect(HistoriqueStatut::where('dossier_id', $resultat['dossier']->id)->count())->toBeGreaterThanOrEqual(1);
});

it('dispatches DeclarationSoumise for every dossier and DeclarationCritique only for level-4 gravity (RG-08)', function () {
    Event::fake([DeclarationSoumise::class, DeclarationCritique::class]);

    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: [],
    );

    Event::assertDispatched(DeclarationSoumise::class);
    Event::assertNotDispatched(DeclarationCritique::class);

    app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 4)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: [],
    );

    Event::assertDispatched(DeclarationCritique::class);
});

it('stores the pieces jointes attached to the created dossier', function () {
    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    $resultat = app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
            'lieu' => 'Atelier',
            'date_survenance' => now()->subDay(),
        ],
        donneesIdentite: [],
        fichiers: [UploadedFile::fake()->image('preuve.jpg')],
    );

    expect($resultat['dossier']->piecesJointes)->toHaveCount(1);
});
