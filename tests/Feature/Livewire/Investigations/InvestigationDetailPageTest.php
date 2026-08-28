<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutInvestigation;
use App\Livewire\Investigations\InvestigationDetailPage;
use App\Models\Investigation;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

function investigationPourTests(string $parcoursCode, User $enqueteur, array $overrides = []): Investigation
{
    $dossier = amenerDossierEnInvestigation($parcoursCode, $enqueteur);

    return Investigation::factory()->create(array_merge([
        'dossier_id' => $dossier->id,
        'enqueteur_id' => $enqueteur->id,
        'statut' => StatutInvestigation::EnCours->value,
    ], $overrides));
}

it('forbids a user outside the dossier parcours scope from viewing the investigation', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant);

    // rqse porte investigations.view/create/update, mais scopé EiEmploye uniquement
    // (RoleParcoursScope) — ne doit donc pas accéder à une investigation Grief Employé.
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)
        ->get(route('dossiers.investigations.show', [$investigation->dossier, $investigation]))
        ->assertForbidden();
});

it('lets the enquêteur edit the fiche while it is "en cours" (EX-INV-02, EX-INV-03, EX-INV-04)', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(InvestigationDetailPage::class, ['dossier' => $investigation->dossier, 'investigation' => $investigation])
        ->set('faitsConstates', 'Faits constatés mis à jour après entretien complémentaire.')
        ->set('causeImmediate', 'Défaut de signalisation temporaire.')
        ->set('recommandations', 'Installer une signalisation permanente.')
        ->call('enregistrer')
        ->assertHasNoErrors();

    expect($investigation->fresh()->cause_immediate)->toBe('Défaut de signalisation temporaire.');
});

it('forbids editing by a role without investigations.update for this parcours', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant);

    $responsable = User::factory()->create();
    $responsable->assignRole('responsable_grief_employe'); // investigations.validate uniquement

    Livewire::actingAs($responsable)->test(InvestigationDetailPage::class, ['dossier' => $investigation->dossier, 'investigation' => $investigation])
        ->set('recommandations', 'Tentative de modification non autorisée.')
        ->call('enregistrer')
        ->assertForbidden();
});

it('submits the fiche for hierarchical validation', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant);

    Livewire::actingAs($correspondant)->test(InvestigationDetailPage::class, ['dossier' => $investigation->dossier, 'investigation' => $investigation])
        ->call('soumettrePourValidation')
        ->assertHasNoErrors();

    expect($investigation->fresh()->statut)->toBe(StatutInvestigation::EnAttenteValidation);
});

it('refuses self-validation by the enquêteur (RGI-06)', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $correspondant->givePermissionTo('investigations.validate'); // scénario limite : mêmes droits que le validateur
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant, [
        'statut' => StatutInvestigation::EnAttenteValidation->value,
    ]);

    Livewire::actingAs($correspondant)->test(InvestigationDetailPage::class, ['dossier' => $investigation->dossier, 'investigation' => $investigation])
        ->call('valider')
        ->assertForbidden();

    expect($investigation->fresh()->statut)->toBe(StatutInvestigation::EnAttenteValidation);
});

it('lets a distinct hierarchical validator validate the fiche', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant, [
        'statut' => StatutInvestigation::EnAttenteValidation->value,
    ]);

    $responsable = User::factory()->create();
    $responsable->assignRole('responsable_grief_employe');

    Livewire::actingAs($responsable)->test(InvestigationDetailPage::class, ['dossier' => $investigation->dossier, 'investigation' => $investigation])
        ->call('valider')
        ->assertHasNoErrors();

    $frais = $investigation->fresh();
    expect($frais->statut)->toBe(StatutInvestigation::Validee)
        ->and($frais->valide_par)->toBe($responsable->id);
});

it('no longer exposes the edit form once submitted for validation', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    $investigation = investigationPourTests(ParcoursCode::GriefEmploye->value, $correspondant, [
        'statut' => StatutInvestigation::EnAttenteValidation->value,
    ]);

    $this->actingAs($correspondant)
        ->get(route('dossiers.investigations.show', [$investigation->dossier, $investigation]))
        ->assertDontSee('wire:submit="enregistrer"', false);
});
