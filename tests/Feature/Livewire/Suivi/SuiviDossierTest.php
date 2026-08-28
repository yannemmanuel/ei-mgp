<?php

use App\Enums\CanalCaptageCode;
use App\Enums\ParcoursCode;
use App\Livewire\Suivi\SuiviDossier;
use App\Models\NiveauGravite;
use App\Services\Declaration\DeclarationService;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

function declarerPourSuivi(bool $anonyme): array
{
    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    return app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: $anonyme,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
        ],
        donneesIdentite: $anonyme ? [] : ['nom_prenom' => 'Awa Koffi'],
    );
}

it('retrieves an anonymous dossier by reference + code d\'accès (EX-NOT-06)', function () {
    ['dossier' => $dossier, 'code_acces' => $code] = declarerPourSuivi(anonyme: true);

    Livewire::test(SuiviDossier::class)
        ->set('reference', $dossier->reference)
        ->set('codeAcces', $code)
        ->call('rechercher')
        ->assertHasNoErrors()
        ->assertSee($dossier->reference)
        ->assertSee('Reçu'); // libellé AFFICHÉ (RGI-10), jamais le libellé interne.
});

it('retrieves a non-anonymous dossier by reference + code d\'accès too (docs/exigences-securite.md §4)', function () {
    ['dossier' => $dossier, 'code_acces' => $code] = declarerPourSuivi(anonyme: false);

    expect($code)->toMatch('/^\d{6}$/');

    Livewire::test(SuiviDossier::class)
        ->set('reference', $dossier->reference)
        ->set('codeAcces', $code)
        ->call('rechercher')
        ->assertHasNoErrors()
        ->assertSee($dossier->reference);
});

it('refuses a wrong code d\'accès with a generic error message', function () {
    ['dossier' => $dossier] = declarerPourSuivi(anonyme: true);

    Livewire::test(SuiviDossier::class)
        ->set('reference', $dossier->reference)
        ->set('codeAcces', '000000')
        ->call('rechercher')
        ->assertHasErrors(['reference']);
});

it('refuses an unknown reference with the same generic error message', function () {
    Livewire::test(SuiviDossier::class)
        ->set('reference', 'EI-2026-999999')
        ->set('codeAcces', '123456')
        ->call('rechercher')
        ->assertHasErrors(['reference']);
});

it('locks out further attempts on the same reference after repeated failures (docs/exigences-securite.md §4)', function () {
    ['dossier' => $dossier] = declarerPourSuivi(anonyme: true);

    for ($i = 0; $i < 5; $i++) {
        Livewire::test(SuiviDossier::class)
            ->set('reference', $dossier->reference)
            ->set('codeAcces', '000000')
            ->call('rechercher');
    }

    // La bonne réponse est désormais bloquée par le verrouillage de la référence, pas par le code lui-même.
    Livewire::test(SuiviDossier::class)
        ->set('reference', $dossier->reference)
        ->set('codeAcces', '000000')
        ->call('rechercher')
        ->assertHasErrors(['reference']);

    expect(RateLimiter::tooManyAttempts('suivi-lookup-ref:'.$dossier->reference, 5))->toBeTrue();
});
