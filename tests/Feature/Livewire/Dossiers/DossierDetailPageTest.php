<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Livewire\Dossiers\DossierDetailPage;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\PieceJointe;
use App\Models\StatutDossier;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids a user outside the dossier parcours scope', function () {
    $sst = User::factory()->create();
    $sst->assignRole('captage_grief_soustraitant');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $this->actingAs($sst)->get(route('dossiers.show', $dossier))->assertForbidden();
});

it('shows the declarant identity to an authorized viewer', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id, 'nom_prenom' => 'Awa Koffi']);

    $this->actingAs($gestionnaire)->get(route('dossiers.show', $dossier))->assertSee('Awa Koffi');
});

it('hides declarant identity from comite_ethique (acteurs.md : sans données nominatives)', function () {
    $comite = User::factory()->create();
    $comite->assignRole('comite_ethique');

    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);
    $dossier->update(['is_anonymous' => false]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id, 'nom_prenom' => 'Jean N\'Guessan']);

    $this->actingAs($comite)->get(route('dossiers.show', $dossier))
        ->assertDontSee('Jean N\'Guessan')
        ->assertSee('pas accessibles à votre rôle');
});

it('lets an authorized user reassign the dossier with a motif', function () {
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp');
    $nouveau = User::factory()->create();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    Livewire::actingAs($chef)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('nouvelUtilisateurId', (string) $nouveau->id)
        ->set('motifReaffectation', 'Prise en charge par le service MGP.')
        ->call('reaffecter')
        ->assertHasNoErrors();

    expect(DossierAffectation::where('dossier_id', $dossier->id)->where('user_id', $nouveau->id)->where('actif', true)->exists())->toBeTrue();
});

it('requires a motif to reassign', function () {
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp');
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    Livewire::actingAs($chef)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('nouvelUtilisateurId', (string) User::factory()->create()->id)
        ->call('reaffecter')
        ->assertHasErrors(['motifReaffectation']);
});

it('forbids reassignment by a role without dossiers.reassign', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    Livewire::actingAs($rqse)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('nouvelUtilisateurId', (string) User::factory()->create()->id)
        ->set('motifReaffectation', 'Motif')
        ->call('reaffecter')
        ->assertForbidden();
});

it('lets an authorized user move the dossier through the workflow graph', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Affecte->value)->first()->id]);

    Livewire::actingAs($rqse)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('nouveauStatutCode', StatutDossierCode::EnAnalyse->value)
        ->call('changerStatut')
        ->assertHasNoErrors();

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::EnAnalyse);
});

it('only exposes the Clôturer action when the dossier is Résolu', function () {
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::EnAnalyse->value)->first()->id]);

    $this->actingAs($chef)->get(route('dossiers.show', $dossier))->assertDontSee('Clôturer (EX-GES-05)');

    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Resolu->value)->first()->id]);
    $this->actingAs($chef)->get(route('dossiers.show', $dossier))->assertSee('Clôturer (EX-GES-05)');
});

it('closes a resolved dossier with a synthese_resolution', function () {
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Resolu->value)->first()->id]);

    Livewire::actingAs($chef)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('syntheseResolution', 'Situation normalisée après remplacement du joint.')
        ->call('cloturer')
        ->assertHasNoErrors();

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Cloture);
});

it('only lets service_mgp / dg reopen a closed dossier (RG-07, EX-GES-06)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Cloture->value)->first()->id]);

    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    Livewire::actingAs($rqse)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('motifReouverture', 'Nouvel élément.')
        ->call('reouvrir')
        ->assertForbidden();

    $dg = User::factory()->create();
    $dg->assignRole('dg');

    Livewire::actingAs($dg)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->set('motifReouverture', 'Nouvel élément porté à notre connaissance.')
        ->call('reouvrir')
        ->assertHasNoErrors();

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Reouvert);
});

it('lets the dpo mark and unmark a dossier as contentieux (RG-11)', function () {
    $dpo = User::factory()->create();
    $dpo->assignRole('dpo');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    expect($dossier->contentieux)->toBeFalse();

    Livewire::actingAs($dpo)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->call('basculerContentieux');

    expect($dossier->fresh()->contentieux)->toBeTrue();

    Livewire::actingAs($dpo)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->call('basculerContentieux');

    expect($dossier->fresh()->contentieux)->toBeFalse();
});

it('forbids a non-dpo role from toggling contentieux (RG-11)', function () {
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    Livewire::actingAs($chef)->test(DossierDetailPage::class, ['dossier' => $dossier])
        ->call('basculerContentieux')
        ->assertForbidden();

    expect($dossier->fresh()->contentieux)->toBeFalse();
});

it('does not show the contentieux control to a non-dpo role', function () {
    $chef = User::factory()->create();
    $chef->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $this->actingAs($chef)->get(route('dossiers.show', $dossier))
        ->assertDontSee('Conservation des données (RG-11)');
});

it('requires authorization to download a piece jointe', function () {
    $sst = User::factory()->create();
    $sst->assignRole('captage_grief_soustraitant');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $piece = PieceJointe::factory()->create([
        'attachable_type' => Dossier::class,
        'attachable_id' => $dossier->id,
    ]);

    $this->actingAs($sst)->get(route('pieces-jointes.telecharger', $piece))->assertForbidden();
});
