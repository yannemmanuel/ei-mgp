<?php

use App\Livewire\Declaration\GriefEmployeForm;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

function champsValidesGriefEmploye(): array
{
    return [
        'categorieId' => (string) categorieDe('grief_employe')->id,
        'niveauGraviteId' => (string) NiveauGravite::where('niveau', 2)->first()->id,
        'description' => str_repeat('a', 25),
        'caractereRepetitif' => 'premiere_fois',
        'dateHeureFaits' => now()->subDay()->format('Y-m-d\TH:i'),
        'lieu' => 'Site de Yopougon',
        'souhaitEtreRecontacte' => false,
    ];
}

it('renders successfully on the public route', function () {
    $this->get(route('declarer.grief-employe'))->assertOk()->assertSeeLivewire(GriefEmployeForm::class);
});

it('requires caractere_repetitif (CDC §9.2)', function () {
    Livewire::test(GriefEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesGriefEmploye())
        ->set('caractereRepetitif', '')
        ->call('submit')
        ->assertHasErrors(['caractereRepetitif']);
});

it('creates an anonymous grief dossier and stores caractere_repetitif on the dossier itself', function () {
    Livewire::test(GriefEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesGriefEmploye())
        ->call('submit')
        ->assertHasNoErrors();

    $dossier = Dossier::first();
    expect($dossier->reference)->toStartWith('GEM-');
    expect($dossier->caractere_repetitif)->toBe('premiere_fois');
    expect(DeclarationIdentite::count())->toBe(0);
});

it('stores personnes_impliquees, temoins and souhait_recontact on declaration_identites when identified', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(GriefEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesGriefEmploye())
        ->set('personnesImpliquees', 'M. X')
        ->set('temoinsEventuels', 'Mme Y')
        ->set('souhaitEtreRecontacte', true)
        ->call('submit')
        ->assertHasNoErrors();

    $identite = DeclarationIdentite::first();
    expect($identite->personnes_impliquees)->toBe('M. X');
    expect($identite->temoins)->toBe('Mme Y');
    expect($identite->souhait_recontact)->toBeTrue();
});
