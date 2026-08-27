<?php

use App\Livewire\Declaration\EiEmployeForm;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

it('redirects a guest away from the relay route (EX-DEC-10 : réservé aux agents authentifiés)', function () {
    $this->get(route('relais.ei-employe'))->assertRedirect('/login');
});

it('forbids an authenticated user without dossiers.create from using the relay route', function () {
    $user = User::factory()->create();
    $user->assignRole('employe_declarant'); // n'a pas dossiers.create

    $this->actingAs($user)->get(route('relais.ei-employe'))->assertForbidden();
});

it('lets an agent_relais submit via the relay route with a mandatory canal, tracing it on the dossier', function () {
    $agent = User::factory()->create();
    $agent->assignRole('agent_relais');

    Livewire::actingAs($agent)
        ->test(EiEmployeForm::class, ['viaRelais' => true])
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set('categorieId', (string) categorieDe('ei_employe')->id)
        ->set('niveauGraviteId', (string) NiveauGravite::where('niveau', 1)->first()->id)
        ->set('description', str_repeat('a', 25))
        ->set('dateSurvenance', now()->subDay()->toDateString())
        ->set('lieu', 'Atelier')
        ->set('canalRelaisChoisi', 'ligne_verte')
        ->call('submit')
        ->assertHasNoErrors();

    $dossier = Dossier::first();
    expect($dossier->canalCaptage->code->value)->toBe('ligne_verte');
});
