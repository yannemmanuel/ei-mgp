<?php

use App\Enums\ParcoursCode;
use App\Exports\DossiersExport;
use App\Livewire\Reporting\DashboardConsolide;
use App\Models\DeclarationIdentite;
use App\Models\Parcours;
use App\Models\User;
use Livewire\Livewire;
use Maatwebsite\Excel\Facades\Excel;

beforeEach(fn () => seedReferentiels());

it('shows the consolidated dashboard to a user with reporting.view (EX-REP-01)', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $this->actingAs($gestionnaire)->get(route('dashboard'))->assertSee('Tableau de bord consolidé');
});

it('shows a personal summary, never a 403, to a user without reporting.view', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $this->actingAs($rqse)->get(route('dashboard'))
        ->assertOk()
        ->assertSee('Bonjour')
        ->assertDontSee('Tableau de bord consolidé');
});

it('filters indicators by parcours (EX-REP-02)', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $parcoursEi = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();

    $composant = Livewire::actingAs($gestionnaire)->test(DashboardConsolide::class)
        ->set('parcoursId', (string) $parcoursEi->id);

    expect($composant->instance()->indicateurs['total'])->toBe(1);
});

it('hides the "inclure les données nominatives" option from dg (reporting.export without .nominatif)', function () {
    $dg = User::factory()->create();
    $dg->assignRole('dg');

    $this->actingAs($dg)->get(route('dashboard'))
        ->assertSee('Export Excel')
        ->assertDontSee('Inclure les données nominatives');
});

it('exports Excel with nominative columns only when authorized (EX-REP-06)', function () {
    Excel::fake();

    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id, 'nom_prenom' => 'Awa Koffi']);

    Livewire::actingAs($gestionnaire)->test(DashboardConsolide::class)
        ->set('inclureNominatif', true)
        ->call('exporterExcel');

    Excel::assertDownloaded('rapport-dossiers.xlsx', function (DossiersExport $export) {
        return in_array('Nom du déclarant', $export->headings(), true);
    });
});

it('never includes nominative columns for a role without reporting.export.nominatif, even if requested', function () {
    Excel::fake();

    $dg = User::factory()->create();
    $dg->assignRole('dg');

    createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    // inclureNominatif forcé côté composant (le formulaire ne l'expose même pas à dg) : vérifie
    // que le serveur ne fait jamais confiance à ce seul indicateur.
    Livewire::actingAs($dg)->test(DashboardConsolide::class)
        ->set('inclureNominatif', true)
        ->call('exporterExcel');

    Excel::assertDownloaded('rapport-dossiers.xlsx', function (DossiersExport $export) {
        return ! in_array('Nom du déclarant', $export->headings(), true);
    });
});

it('forbids exporting for a role without reporting.export', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    Livewire::actingAs($rqse)->test(DashboardConsolide::class)
        ->call('exporterExcel')
        ->assertForbidden();
});

it('renders the PDF export view without error, with and without nominative columns (EX-REP-04/06)', function () {
    // Le binaire PDF généré par dompdf n'est pas sérialisable en JSON par le harnais de test
    // Livewire (réponse d'action non-JSON) — la vue est donc vérifiée directement plutôt qu'au
    // travers de DashboardConsolide::exporterPdf(), déjà couvert côté autorisation ci-dessous.
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id, 'nom_prenom' => 'Awa Koffi']);

    $sansNominatif = view('exports.dossiers-pdf', ['dossiers' => collect([$dossier->fresh(['parcours', 'categorie', 'niveauGravite', 'statut'])]), 'inclureNominatif' => false])->render();
    expect($sansNominatif)->toContain($dossier->reference)->not->toContain('Awa Koffi');

    $avecNominatif = view('exports.dossiers-pdf', ['dossiers' => collect([$dossier->fresh(['parcours', 'categorie', 'niveauGravite', 'statut', 'identite'])]), 'inclureNominatif' => true])->render();
    expect($avecNominatif)->toContain('Awa Koffi');
});

it('forbids the PDF export for a role without reporting.export', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    Livewire::actingAs($rqse)->test(DashboardConsolide::class)
        ->call('exporterPdf')
        ->assertForbidden();
});
