<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutActionCorrective;
use App\Livewire\ActionsCorrectives\ActionCorrectivePanel;
use App\Models\ActionCorrective;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('shows the création form to an authorized gestionnaire once the dossier is "action corrective en cours"', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->assertSee('Créer une action corrective');
});

it('hides the création form when the dossier has not reached "action corrective en cours"', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->assertDontSee('Créer une action corrective');
});

it('creates an action corrective with valid data (EX-ACT-01/02)', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::GriefEmploye->value, $correspondant);
    $responsable = User::factory()->create();

    Livewire::actingAs($correspondant)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->set('intitule', 'Réviser la procédure de consigne')
        ->set('description', 'Mettre à jour la procédure de consigne pour intégrer le retour d\'expérience.')
        ->set('responsableId', (string) $responsable->id)
        ->set('echeance', now()->addMonth()->toDateString())
        ->call('creer')
        ->assertHasNoErrors();

    $action = ActionCorrective::where('dossier_id', $dossier->id)->firstOrFail();
    expect($action->responsable_id)->toBe($responsable->id)
        ->and($action->statut)->toBe(StatutActionCorrective::NonDemarree);
});

it('re-verifies authorization server-side for a role outside the parcours scope', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse'); // scopé EiEmploye uniquement
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::GriefEmploye->value, $rqse);

    Livewire::actingAs($rqse)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->set('intitule', 'Hors périmètre')
        ->set('description', 'Tentative de création hors périmètre.')
        ->set('responsableId', (string) User::factory()->create()->id)
        ->set('echeance', now()->addMonth()->toDateString())
        ->call('creer')
        ->assertForbidden();
});

it('lets an authorized user progress an action through démarrer / marquer réalisée / vérifier / clôturer', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp'); // actions.update
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp'); // actions.verify_efficacite, actions.close

    $dossier = amenerDossierEnActionCorrective(ParcoursCode::GriefEmploye->value, $correspondant);
    $action = ActionCorrective::factory()->create(['dossier_id' => $dossier->id]);

    Livewire::actingAs($correspondant)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->call('demarrer', $action->id)
        ->assertHasNoErrors();
    expect($action->fresh()->statut)->toBe(StatutActionCorrective::EnCours);

    Livewire::actingAs($correspondant)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->call('marquerRealisee', $action->id)
        ->assertHasNoErrors();
    expect($action->fresh()->statut)->toBe(StatutActionCorrective::Realisee);

    Livewire::actingAs($chef)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->call('ouvrirVerification', $action->id)
        ->set('efficace', true)
        ->set('commentaireVerification', 'Mesure efficace, constat confirmé sur le terrain.')
        ->call('soumettreVerification')
        ->assertHasNoErrors();
    expect($action->fresh()->verification_efficacite)->toBeTrue();

    Livewire::actingAs($chef)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->call('cloturerAction', $action->id)
        ->assertHasNoErrors();
    expect($action->fresh()->date_cloture)->not->toBeNull();
});

it('forbids progressing an action for a role without actions.update for this parcours', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::GriefEmploye->value, $correspondant);
    $action = ActionCorrective::factory()->create(['dossier_id' => $dossier->id]);

    $comite = User::factory()->create();
    $comite->assignRole('comite_ethique'); // aucune permission actions.*

    Livewire::actingAs($comite)->test(ActionCorrectivePanel::class, ['dossier' => $dossier])
        ->call('demarrer', $action->id)
        ->assertForbidden();
});
