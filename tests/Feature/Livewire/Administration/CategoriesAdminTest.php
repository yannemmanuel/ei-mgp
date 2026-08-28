<?php

use App\Enums\ParcoursCode;
use App\Livewire\Administration\CategoriesAdmin;
use App\Models\Categorie;
use App\Models\Parcours;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without referentiels.categories.manage', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('administration.categories'))->assertForbidden();
});

it('lets service_mgp create a categorie for a parcours', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');
    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();

    Livewire::actingAs($gestionnaire)->test(CategoriesAdmin::class)
        ->set('parcoursId', (string) $parcours->id)
        ->set('code', 'nouvelle_categorie')
        ->set('libelle', 'Nouvelle catégorie')
        ->set('ordre', '5')
        ->call('enregistrer')
        ->assertHasNoErrors();

    expect(Categorie::where('code', 'nouvelle_categorie')->where('parcours_id', $parcours->id)->exists())->toBeTrue();
});

it('lets service_mgp edit an existing categorie', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');
    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();
    $categorie = Categorie::where('parcours_id', $parcours->id)->firstOrFail();

    Livewire::actingAs($gestionnaire)->test(CategoriesAdmin::class)
        ->call('modifier', $categorie->id)
        ->set('libelle', 'Libellé modifié')
        ->set('actif', false)
        ->call('enregistrer')
        ->assertHasNoErrors();

    $categorie->refresh();
    expect($categorie->libelle)->toBe('Libellé modifié')
        ->and($categorie->actif)->toBeFalse();
});
