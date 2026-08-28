<?php

use App\Livewire\Administration\NotificationTemplatesAdmin;
use App\Models\NotificationTemplate;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without notifications.templates.manage', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('administration.notifications'))->assertForbidden();
});

it('lets service_mgp create a gabarit with parsed destinataires supplémentaires', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    Livewire::actingAs($gestionnaire)->test(NotificationTemplatesAdmin::class)
        ->set('evenementCode', 'evenement_test')
        ->set('canal', 'email')
        ->set('objet', 'Objet de test {reference}')
        ->set('corps', 'Corps de test.')
        ->set('destinatairesSupplementaires', 'a@example.test, b@example.test')
        ->call('enregistrer')
        ->assertHasNoErrors();

    $template = NotificationTemplate::where('evenement_code', 'evenement_test')->firstOrFail();
    expect($template->destinataires_email_supplementaires)->toBe(['a@example.test', 'b@example.test']);
});

it('rejects an invalid email address among the destinataires supplémentaires', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    Livewire::actingAs($gestionnaire)->test(NotificationTemplatesAdmin::class)
        ->set('evenementCode', 'evenement_test')
        ->set('canal', 'email')
        ->set('objet', 'Objet')
        ->set('corps', 'Corps.')
        ->set('destinatairesSupplementaires', 'pas-un-email')
        ->call('enregistrer')
        ->assertHasErrors(['destinatairesSupplementaires']);
});

it('lets service_mgp correct the DT-28 placeholder addresses seeded in Phase 9', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $template = NotificationTemplate::where('evenement_code', 'circuit_critique')
        ->whereNotNull('destinataires_email_supplementaires')
        ->firstOrFail();

    Livewire::actingAs($gestionnaire)->test(NotificationTemplatesAdmin::class)
        ->call('modifier', $template->id)
        ->set('destinatairesSupplementaires', 'reelle-adresse@organisation.test')
        ->call('enregistrer')
        ->assertHasNoErrors();

    expect($template->fresh()->destinataires_email_supplementaires)->toBe(['reelle-adresse@organisation.test']);
});
