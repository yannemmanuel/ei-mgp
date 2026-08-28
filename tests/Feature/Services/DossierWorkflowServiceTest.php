<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\HistoriqueStatut;
use App\Models\StatutDossier;
use App\Models\User;
use App\Services\Workflow\DossierWorkflowService;
use RuntimeException;

beforeEach(fn () => seedReferentiels());

function dossierAuStatut(string $parcoursCode, StatutDossierCode $statut): Dossier
{
    $dossier = createTestDossierForParcours($parcoursCode);
    $dossier->update(['statut_id' => StatutDossier::where('code', $statut->value)->firstOrFail()->id]);

    return $dossier->fresh();
}

it('follows the CDC §7.1 transition graph and rejects transitions outside it (EX-GES-04)', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Affecte);
    $acteur = User::factory()->create();
    $workflow = app(DossierWorkflowService::class);

    $workflow->changerStatut($dossier, StatutDossierCode::EnAnalyse, $acteur);

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::EnAnalyse);

    expect(fn () => $workflow->changerStatut($dossier->fresh(), StatutDossierCode::Cloture, $acteur))
        ->toThrow(RuntimeException::class);
});

it('records a historique_statuts entry for every transition, with the acting user', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Affecte);
    $acteur = User::factory()->create();

    app(DossierWorkflowService::class)->changerStatut($dossier, StatutDossierCode::EnAnalyse, $acteur, 'Analyse démarrée.');

    $entree = HistoriqueStatut::where('dossier_id', $dossier->id)->latest()->first();
    expect($entree->effectue_par)->toBe($acteur->id);
    expect($entree->commentaire)->toBe('Analyse démarrée.');
    expect($entree->statutSuivant->code)->toBe(StatutDossierCode::EnAnalyse);
});

it('rejects a dossier only from En analyse and records the motif', function () {
    $dossier = dossierAuStatut(ParcoursCode::GriefEmploye->value, StatutDossierCode::EnAnalyse);
    $acteur = User::factory()->create();

    app(DossierWorkflowService::class)->rejeter($dossier, $acteur, 'Faits non constitutifs.');

    $dossier->refresh();
    expect($dossier->statut->code)->toBe(StatutDossierCode::Rejete);
    expect($dossier->motif_rejet)->toBe('Faits non constitutifs.');
});

it('refuses to reject a dossier that is not En analyse', function () {
    $dossier = dossierAuStatut(ParcoursCode::GriefEmploye->value, StatutDossierCode::Affecte);
    $acteur = User::factory()->create();

    expect(fn () => app(DossierWorkflowService::class)->rejeter($dossier, $acteur, 'Motif'))
        ->toThrow(RuntimeException::class);
});

it('closes a dossier with no corrective actions (RG-10 is vacuously satisfied)', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Resolu);
    $acteur = User::factory()->create();

    app(DossierWorkflowService::class)->cloturer($dossier, $acteur, 'Mesures mises en œuvre, situation normalisée.');

    $dossier->refresh();
    expect($dossier->statut->code)->toBe(StatutDossierCode::Cloture);
    expect($dossier->synthese_resolution)->toBe('Mesures mises en œuvre, situation normalisée.');
});

it('refuses to close a dossier with an open corrective action (RG-10)', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Resolu);
    ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'date_cloture' => null,
        'verification_efficacite' => null,
    ]);
    $acteur = User::factory()->create();

    expect(fn () => app(DossierWorkflowService::class)->cloturer($dossier, $acteur, 'Synthèse'))
        ->toThrow(RuntimeException::class);

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Resolu);
});

it('refuses to close a dossier whose action was closed without verified efficacite (RG-10)', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Resolu);
    ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'date_cloture' => now(),
        'verification_efficacite' => false,
    ]);
    $acteur = User::factory()->create();

    expect(fn () => app(DossierWorkflowService::class)->cloturer($dossier, $acteur, 'Synthèse'))
        ->toThrow(RuntimeException::class);
});

it('allows closing when every corrective action is closed and verified efficacious', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Resolu);
    ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'date_cloture' => now(),
        'verification_efficacite' => true,
    ]);
    $acteur = User::factory()->create();

    app(DossierWorkflowService::class)->cloturer($dossier, $acteur, 'Synthèse complète.');

    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Cloture);
});

it('refuses to close a dossier that is not Résolu', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::EnAnalyse);
    $acteur = User::factory()->create();

    expect(fn () => app(DossierWorkflowService::class)->cloturer($dossier, $acteur, 'Synthèse'))
        ->toThrow(RuntimeException::class);
});

it('reopens a closed dossier and records the motif (RG-07)', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Cloture);
    $acteur = User::factory()->create();

    app(DossierWorkflowService::class)->reouvrir($dossier, $acteur, 'Élément nouveau porté à notre connaissance.');

    $dossier->refresh();
    expect($dossier->statut->code)->toBe(StatutDossierCode::Reouvert);
    expect($dossier->motif_reouverture)->toBe('Élément nouveau porté à notre connaissance.');
});

it('refuses to reopen a dossier that is not Clôturé', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::Resolu);
    $acteur = User::factory()->create();

    expect(fn () => app(DossierWorkflowService::class)->reouvrir($dossier, $acteur, 'Motif'))
        ->toThrow(RuntimeException::class);
});

it('lists only the manual transitions reachable from the current status', function () {
    $dossier = dossierAuStatut(ParcoursCode::EiEmploye->value, StatutDossierCode::EnInvestigation);

    $codes = collect(app(DossierWorkflowService::class)->transitionsManuelles($dossier))
        ->map(fn ($s) => $s->code)->all();

    expect($codes)->toEqualCanonicalizing([StatutDossierCode::EnAttenteInformation, StatutDossierCode::ActionCorrectiveEnCours]);
});
