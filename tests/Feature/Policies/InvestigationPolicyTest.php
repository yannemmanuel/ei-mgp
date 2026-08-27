<?php

use App\Enums\ParcoursCode;
use App\Models\Investigation;
use App\Models\User;
use Database\Seeders\CanalCaptageSeeder;
use Database\Seeders\CategorieSeeder;
use Database\Seeders\NiveauGraviteSeeder;
use Database\Seeders\ParcoursSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\StatutDossierSeeder;

beforeEach(function () {
    $this->seed(ParcoursSeeder::class);
    $this->seed(CategorieSeeder::class);
    $this->seed(NiveauGraviteSeeder::class);
    $this->seed(StatutDossierSeeder::class);
    $this->seed(CanalCaptageSeeder::class);
    $this->seed(RolePermissionSeeder::class);
});

it('never lets the enqueteur validate their own investigation (RGI-06)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $enqueteur = User::factory()->create();
    $enqueteur->assignRole('correspondant_mgp');

    $investigation = Investigation::factory()->create([
        'dossier_id' => $dossier->id,
        'enqueteur_id' => $enqueteur->id,
    ]);

    // correspondant_mgp n'a de toute façon pas investigations.validate, mais on veut vérifier
    // spécifiquement la règle d'auto-validation, donc on teste aussi avec un rôle qui l'a.
    $responsable = User::factory()->create();
    $responsable->assignRole('responsable_grief_employe');

    $investigationDeLuiMeme = Investigation::factory()->create([
        'dossier_id' => $dossier->id,
        'enqueteur_id' => $responsable->id,
    ]);

    expect($responsable->can('validateInvestigation', $investigationDeLuiMeme))->toBeFalse();
});

it('lets a different responsable_grief_employe validate the investigation', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $enqueteur = User::factory()->create();
    $enqueteur->assignRole('correspondant_mgp');

    $investigation = Investigation::factory()->create([
        'dossier_id' => $dossier->id,
        'enqueteur_id' => $enqueteur->id,
    ]);

    $validateur = User::factory()->create();
    $validateur->assignRole('responsable_grief_employe');

    expect($validateur->can('validateInvestigation', $investigation))->toBeTrue();
});
