<?php

use App\Livewire\Administration\CanauxAdmin;
use App\Models\CanalCaptage;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without canaux.manage', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $this->actingAs($gestionnaire)->get(route('administration.canaux'))->assertForbidden();
});

it('lets administrateur_digital edit an existing canal\'s libellé and statut', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');
    $canal = CanalCaptage::first();

    Livewire::actingAs($admin)->test(CanauxAdmin::class)
        ->call('modifier', $canal->id)
        ->set('libelle', 'Libellé mis à jour')
        ->set('actif', false)
        ->call('enregistrer')
        ->assertHasNoErrors();

    $canal->refresh();
    expect($canal->libelle)->toBe('Libellé mis à jour')
        ->and($canal->actif)->toBeFalse();
});
