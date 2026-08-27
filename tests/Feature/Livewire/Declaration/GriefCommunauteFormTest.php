<?php

use App\Livewire\Declaration\GriefCommunauteForm;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

function champsValidesGriefCommunaute(): array
{
    return [
        'categorieId' => (string) categorieDe('grief_communaute')->id,
        'niveauGraviteId' => (string) NiveauGravite::where('niveau', 3)->first()->id,
        'description' => str_repeat('a', 25),
        'dateSurvenance' => now()->subDay()->toDateString(),
        'lieu' => 'Village de Kokoti',
        'statutPlaignant' => 'riverain',
    ];
}

it('renders successfully on the public route without authentication', function () {
    $this->get(route('declarer.grief-communaute'))->assertOk()->assertSeeLivewire(GriefCommunauteForm::class);
});

it('always requires statut_plaignant, even for an anonymous declaration', function () {
    Livewire::test(GriefCommunauteForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesGriefCommunaute())
        ->set('statutPlaignant', '')
        ->call('submit')
        ->assertHasErrors(['statutPlaignant']);
});

it('does not require localite when anonymous, but requires it when identified', function () {
    Livewire::test(GriefCommunauteForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesGriefCommunaute())
        ->call('submit')
        ->assertHasNoErrors();

    Livewire::test(GriefCommunauteForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesGriefCommunaute())
        ->call('submit')
        ->assertHasErrors(['localite']);
});

it('maps personnes_biens_affectes onto declaration_identites.personnes_impliquees', function () {
    Livewire::test(GriefCommunauteForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesGriefCommunaute())
        ->set('localite', 'Village de Kokoti')
        ->set('personnesBiensAffectes', 'Champ de manioc endommagé')
        ->call('submit')
        ->assertHasNoErrors();

    expect(DeclarationIdentite::first()->personnes_impliquees)->toBe('Champ de manioc endommagé');
});

it('creates a dossier with the GCO reference prefix', function () {
    Livewire::test(GriefCommunauteForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesGriefCommunaute())
        ->call('submit');

    expect(Dossier::first()->reference)->toStartWith('GCO-');
});
