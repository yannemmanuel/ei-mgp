<?php

use App\Enums\ParcoursCode;
use App\Livewire\Investigations\InvestigationPanel;
use App\Models\Investigation;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('shows the ouverture form to an authorized enquêteur once the dossier is "en investigation"', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->assertSee('Ouvrir une nouvelle investigation');
});

it('hides the ouverture form when the dossier has not reached "en investigation"', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    Livewire::actingAs($correspondant)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->assertDontSee('Ouvrir une nouvelle investigation');
});

it('hides the ouverture form from a user without investigations.create for this parcours', function () {
    $responsable = User::factory()->create();
    $responsable->assignRole('responsable_grief_employe'); // porte investigations.validate, pas .create

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $responsable);

    Livewire::actingAs($responsable)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->assertDontSee('Ouvrir une nouvelle investigation');
});

it('opens an investigation with valid data (EX-INV-01)', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->set('dateOuverture', now()->toDateString())
        ->set('faitsConstates', 'Entretien mené avec les parties concernées sur site.')
        ->set('recommandations', 'Revoir la procédure de consigne en vigueur.')
        ->call('ouvrir')
        ->assertHasNoErrors();

    $investigation = Investigation::where('dossier_id', $dossier->id)->firstOrFail();
    expect($investigation->enqueteur_id)->toBe($correspondant->id);
});

it('requires faits_constates and recommandations to open an investigation', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->set('dateOuverture', now()->toDateString())
        ->call('ouvrir')
        ->assertHasErrors(['faitsConstates', 'recommandations']);
});

it('re-verifies authorization server-side even if the form is called directly (RGI/parcours scope)', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse'); // scopé EiEmploye uniquement

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $rqse);

    Livewire::actingAs($rqse)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->set('dateOuverture', now()->toDateString())
        ->set('faitsConstates', 'Constats hors périmètre.')
        ->set('recommandations', 'Recommandations hors périmètre.')
        ->call('ouvrir')
        ->assertForbidden();
});

it('lists existing investigations for the dossier', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $correspondant);
    Investigation::factory()->create([
        'dossier_id' => $dossier->id,
        'enqueteur_id' => $correspondant->id,
    ]);

    Livewire::actingAs($correspondant)->test(InvestigationPanel::class, ['dossier' => $dossier])
        ->assertSee($correspondant->name);
});
