<?php

use App\Livewire\Administration\SitesAdmin;
use App\Models\Site;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without referentiels.sites.manage', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('administration.sites'))->assertForbidden();
});

it('lets service_mgp create and edit a site', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    Livewire::actingAs($gestionnaire)->test(SitesAdmin::class)
        ->set('code', 'site_test')
        ->set('libelle', 'Site de test')
        ->call('enregistrer')
        ->assertHasNoErrors();

    $site = Site::where('code', 'site_test')->firstOrFail();

    Livewire::actingAs($gestionnaire)->test(SitesAdmin::class)
        ->call('modifier', $site->id)
        ->set('libelle', 'Site renommé')
        ->call('enregistrer')
        ->assertHasNoErrors();

    expect($site->fresh()->libelle)->toBe('Site renommé');
});
