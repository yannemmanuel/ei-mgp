<?php

use App\Enums\ExpediteurType;
use App\Enums\ParcoursCode;
use App\Livewire\Messagerie\MessagerieDossier;
use App\Models\Message;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('lets an authorized staff member send a message, recorded as "agent" (EX-NOT-07)', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    Livewire::actingAs($correspondant)->test(MessagerieDossier::class, ['dossier' => $dossier])
        ->set('corps', 'Merci de préciser la date exacte des faits.')
        ->call('envoyer')
        ->assertHasNoErrors();

    $message = Message::where('dossier_id', $dossier->id)->firstOrFail();
    expect($message->expediteur_type)->toBe(ExpediteurType::Agent)
        ->and($message->expediteur_user_id)->toBe($correspondant->id);
});

it('forbids a staff member without messagerie.send from sending a message', function () {
    $dg = User::factory()->create();
    $dg->assignRole('dg'); // aucune permission messagerie.*
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    Livewire::actingAs($dg)->test(MessagerieDossier::class, ['dossier' => $dossier])
        ->set('corps', 'Tentative non autorisée.')
        ->call('envoyer')
        ->assertForbidden();
});

it('forbids a staff member outside the dossier parcours scope', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse'); // messagerie.* non porté par ce rôle de toute façon
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    Livewire::actingAs($rqse)->test(MessagerieDossier::class, ['dossier' => $dossier])
        ->set('corps', 'Hors périmètre.')
        ->call('envoyer')
        ->assertForbidden();
});

it('lets a declarant with a verified /suivi session grant send a message, recorded without identity (RG-06)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    session(["suivi_verifie_{$dossier->id}" => true]);

    Livewire::test(MessagerieDossier::class, ['dossier' => $dossier])
        ->set('corps', 'Je souhaite ajouter une précision.')
        ->call('envoyer')
        ->assertHasNoErrors();

    $message = Message::where('dossier_id', $dossier->id)->firstOrFail();
    expect($message->expediteur_type)->toBe(ExpediteurType::Declarant)
        ->and($message->expediteur_user_id)->toBeNull();
});

it('forbids a declarant without a verified /suivi session grant from sending a message', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    Livewire::test(MessagerieDossier::class, ['dossier' => $dossier])
        ->set('corps', 'Tentative sans passer par /suivi.')
        ->call('envoyer')
        ->assertForbidden();
});

it('lists messages from both sides in chronological order', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    Message::create([
        'dossier_id' => $dossier->id,
        'expediteur_type' => ExpediteurType::Declarant->value,
        'expediteur_user_id' => null,
        'corps' => 'Premier message du déclarant.',
    ]);
    Message::create([
        'dossier_id' => $dossier->id,
        'expediteur_type' => ExpediteurType::Agent->value,
        'expediteur_user_id' => $correspondant->id,
        'corps' => 'Réponse de l\'agent.',
    ]);

    Livewire::actingAs($correspondant)->test(MessagerieDossier::class, ['dossier' => $dossier])
        ->assertSeeInOrder(['Premier message du déclarant.', "Réponse de l'agent."]);
});

it('marks the other side\'s unread messages as read when the panel is opened', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $message = Message::create([
        'dossier_id' => $dossier->id,
        'expediteur_type' => ExpediteurType::Declarant->value,
        'expediteur_user_id' => null,
        'corps' => 'Message non lu.',
    ]);

    expect($message->lu_le)->toBeNull();

    Livewire::actingAs($correspondant)->test(MessagerieDossier::class, ['dossier' => $dossier]);

    expect($message->fresh()->lu_le)->not->toBeNull();
});
