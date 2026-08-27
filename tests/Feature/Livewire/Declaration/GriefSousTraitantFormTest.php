<?php

use App\Livewire\Declaration\GriefSousTraitantForm;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

function champsValidesGriefSousTraitant(): array
{
    return [
        'categorieId' => (string) categorieDe('grief_sous_traitant')->id,
        'niveauGraviteId' => (string) NiveauGravite::where('niveau', 3)->first()->id,
        'description' => str_repeat('a', 25),
        'lieuSite' => 'Chantier zone Nord',
        'dateHeureFaits' => now()->subDay()->format('Y-m-d\TH:i'),
        'souhaitEtreInforme' => true,
    ];
}

it('renders successfully on the public route without authentication', function () {
    $this->get(route('declarer.grief-sous-traitant'))->assertOk()->assertSeeLivewire(GriefSousTraitantForm::class);
});

it('never requires authentication, even when identified (EX-DEC-05)', function () {
    Livewire::test(GriefSousTraitantForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesGriefSousTraitant())
        ->set('consentementRgpd', true)
        ->call('submit')
        ->assertHasNoErrors();

    expect(Dossier::count())->toBe(1);
});

it('blocks an identified submission without RGPD consent (RG-15)', function () {
    Livewire::test(GriefSousTraitantForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesGriefSousTraitant())
        ->set('consentementRgpd', false)
        ->call('submit')
        ->assertHasErrors(['consentementRgpd']);

    expect(Dossier::count())->toBe(0);
});

it('does not require RGPD consent for an anonymous declaration (no personal data collected)', function () {
    Livewire::test(GriefSousTraitantForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesGriefSousTraitant())
        ->call('submit')
        ->assertHasNoErrors();

    expect(DeclarationIdentite::count())->toBe(0);
});

it('persists the RGPD consent on declaration_identites', function () {
    Livewire::test(GriefSousTraitantForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesGriefSousTraitant())
        ->set('consentementRgpd', true)
        ->call('submit')
        ->assertHasNoErrors();

    expect(DeclarationIdentite::first()->consentement_rgpd)->toBeTrue();
});
