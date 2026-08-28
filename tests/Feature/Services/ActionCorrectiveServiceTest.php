<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutActionCorrective;
use App\Enums\StatutDossierCode;
use App\Enums\StatutInvestigation;
use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\User;
use App\Services\ActionCorrective\ActionCorrectiveService;
use Carbon\CarbonImmutable;

beforeEach(function () {
    seedReferentiels();
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));
});

afterEach(fn () => CarbonImmutable::setTestNow());

function actionDonnees(array $overrides = []): array
{
    return array_merge([
        'investigation_id' => null,
        'intitule' => 'Renforcer la signalisation',
        'description' => 'Installer une signalisation permanente sur la zone concernée.',
        'responsable_id' => User::factory()->create()->id,
        'echeance' => '2026-09-15',
    ], $overrides);
}

function dossierQuelconqueActionCorrective(): Dossier
{
    return amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, User::factory()->create());
}

it('creates an action corrective on a dossier "action corrective en cours" (EX-ACT-01, EX-ACT-02)', function () {
    $acteur = User::factory()->create();
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, $acteur);
    $responsable = User::factory()->create();

    $action = app(ActionCorrectiveService::class)->creer($dossier, actionDonnees(['responsable_id' => $responsable->id]));

    expect($action->exists)->toBeTrue()
        ->and($action->dossier_id)->toBe($dossier->id)
        ->and($action->responsable_id)->toBe($responsable->id)
        ->and($action->statut)->toBe(StatutActionCorrective::NonDemarree);
});

it('refuses to create an action on a dossier that is not "action corrective en cours" (EX-ACT-01)', function () {
    $acteur = User::factory()->create();
    $dossier = amenerDossierEnInvestigation(ParcoursCode::EiEmploye->value, $acteur);

    expect(fn () => app(ActionCorrectiveService::class)->creer($dossier, actionDonnees()))
        ->toThrow(RuntimeException::class);
});

it('refuses to link an action to an investigation that is not validated (EX-ACT-01)', function () {
    $acteur = User::factory()->create();
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, $acteur);
    $investigation = Investigation::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutInvestigation::EnCours->value,
    ]);

    expect(fn () => app(ActionCorrectiveService::class)->creer($dossier, actionDonnees(['investigation_id' => $investigation->id])))
        ->toThrow(RuntimeException::class);
});

it('accepts an action linked to a validated investigation', function () {
    $acteur = User::factory()->create();
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, $acteur);
    $investigation = Investigation::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutInvestigation::Validee->value,
    ]);

    $action = app(ActionCorrectiveService::class)->creer($dossier, actionDonnees(['investigation_id' => $investigation->id]));

    expect($action->investigation_id)->toBe($investigation->id);
});

it('refuses an échéance not postérieure to the creation date (RGI-07)', function () {
    $acteur = User::factory()->create();
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, $acteur);

    expect(fn () => app(ActionCorrectiveService::class)->creer($dossier, actionDonnees(['echeance' => '2026-08-28'])))
        ->toThrow(RuntimeException::class);
});

it('transitions "non démarrée" to "en cours" then "réalisée"', function () {
    $action = ActionCorrective::factory()->create(['dossier_id' => dossierQuelconqueActionCorrective()->id]);
    $service = app(ActionCorrectiveService::class);

    $service->changerStatut($action, StatutActionCorrective::EnCours);
    expect($action->fresh()->statut)->toBe(StatutActionCorrective::EnCours);

    $service->changerStatut($action->fresh(), StatutActionCorrective::Realisee);
    expect($action->fresh()->statut)->toBe(StatutActionCorrective::Realisee);
});

it('refuses to skip directly from "non démarrée" to "réalisée"', function () {
    $action = ActionCorrective::factory()->create(['dossier_id' => dossierQuelconqueActionCorrective()->id]);

    expect(fn () => app(ActionCorrectiveService::class)->changerStatut($action, StatutActionCorrective::Realisee))
        ->toThrow(RuntimeException::class);
});

it('refuses to verify efficacité before the action is "réalisée" (EX-ACT-04)', function () {
    $action = ActionCorrective::factory()->create([
        'dossier_id' => dossierQuelconqueActionCorrective()->id,
        'statut' => StatutActionCorrective::EnCours->value,
    ]);

    expect(fn () => app(ActionCorrectiveService::class)->verifierEfficacite($action, true, 'Efficace.'))
        ->toThrow(RuntimeException::class);
});

it('requires a commentaire for a positive vérification (RGI-08)', function () {
    $action = ActionCorrective::factory()->create([
        'dossier_id' => dossierQuelconqueActionCorrective()->id,
        'statut' => StatutActionCorrective::Realisee->value,
    ]);

    expect(fn () => app(ActionCorrectiveService::class)->verifierEfficacite($action, true, null))
        ->toThrow(RuntimeException::class);
});

it('accepts a negative vérification without commentaire', function () {
    $action = ActionCorrective::factory()->create([
        'dossier_id' => dossierQuelconqueActionCorrective()->id,
        'statut' => StatutActionCorrective::Realisee->value,
    ]);

    app(ActionCorrectiveService::class)->verifierEfficacite($action, false, null);

    expect($action->fresh()->verification_efficacite)->toBeFalse();
});

it('refuses closure without a positive vérification (RGI-09)', function () {
    $acteur = User::factory()->create();
    $action = ActionCorrective::factory()->create([
        'dossier_id' => dossierQuelconqueActionCorrective()->id,
        'statut' => StatutActionCorrective::Realisee->value,
        'verification_efficacite' => false,
    ]);

    expect(fn () => app(ActionCorrectiveService::class)->cloturer($action, $acteur))
        ->toThrow(RuntimeException::class);
});

it('closes an action once vérification is positive and sets date_cloture', function () {
    $acteur = User::factory()->create();
    $action = ActionCorrective::factory()->create([
        'dossier_id' => dossierQuelconqueActionCorrective()->id,
        'statut' => StatutActionCorrective::Realisee->value,
        'verification_efficacite' => true,
        'verification_commentaire' => 'Efficace.',
    ]);

    app(ActionCorrectiveService::class)->cloturer($action, $acteur);

    expect($action->fresh()->date_cloture)->not->toBeNull();
});

it('auto-transitions the dossier to "Résolu" once every action is closed (EX-ACT-05)', function () {
    $acteur = User::factory()->create();
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, $acteur);

    $premiere = ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutActionCorrective::Realisee->value,
        'verification_efficacite' => true,
        'verification_commentaire' => 'Efficace.',
    ]);
    $seconde = ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutActionCorrective::Realisee->value,
        'verification_efficacite' => true,
        'verification_commentaire' => 'Efficace.',
    ]);

    $service = app(ActionCorrectiveService::class);
    $service->cloturer($premiere, $acteur);
    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::ActionCorrectiveEnCours);

    $service->cloturer($seconde, $acteur);
    expect($dossier->fresh()->statut->code)->toBe(StatutDossierCode::Resolu);
});

it('flags overdue non-réalisée actions as "en retard" but leaves réalisée actions untouched (EX-ACT-03)', function () {
    $dossier = dossierQuelconqueActionCorrective();

    $enRetard = ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutActionCorrective::EnCours->value,
        'echeance' => '2026-08-20', // passée
    ]);
    $pasEncore = ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutActionCorrective::NonDemarree->value,
        'echeance' => '2026-09-30', // future
    ]);
    $dejaRealisee = ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutActionCorrective::Realisee->value,
        'echeance' => '2026-08-01', // passée, mais déjà réalisée
    ]);

    $nombre = app(ActionCorrectiveService::class)->recalculerRetards();

    expect($nombre)->toBe(1)
        ->and($enRetard->fresh()->statut)->toBe(StatutActionCorrective::EnRetard)
        ->and($pasEncore->fresh()->statut)->toBe(StatutActionCorrective::NonDemarree)
        ->and($dejaRealisee->fresh()->statut)->toBe(StatutActionCorrective::Realisee);
});
