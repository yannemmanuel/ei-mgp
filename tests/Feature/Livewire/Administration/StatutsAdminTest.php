<?php

use App\Enums\StatutDossierCode;
use App\Livewire\Administration\StatutsAdmin;
use App\Models\StatutDossier;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without referentiels.statuts.manage', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('administration.statuts'))->assertForbidden();
});

it('lets service_mgp edit the libellé affiché of a statut (RGI-10 projection)', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');
    $statut = StatutDossier::where('code', StatutDossierCode::EnInvestigation->value)->firstOrFail();

    Livewire::actingAs($gestionnaire)->test(StatutsAdmin::class)
        ->call('modifier', $statut->id)
        ->set('libelleAffiche', 'En cours de traitement')
        ->call('enregistrer')
        ->assertHasNoErrors();

    expect($statut->fresh()->libelle_affiche)->toBe('En cours de traitement');
});
