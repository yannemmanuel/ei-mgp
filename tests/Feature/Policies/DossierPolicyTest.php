<?php

use App\Enums\ParcoursCode;
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

it('lets rqse view an EI dossier but not a grief communaute dossier', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $eiDossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $griefCommunaute = createTestDossierForParcours(ParcoursCode::GriefCommunaute->value);

    expect($rqse->can('view', $eiDossier))->toBeTrue();
    expect($rqse->can('view', $griefCommunaute))->toBeFalse();
});

it('lets correspondant_mgp view the 3 grief parcours but not EI', function () {
    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');

    expect($correspondant->can('view', createTestDossierForParcours(ParcoursCode::GriefEmploye->value)))->toBeTrue();
    expect($correspondant->can('view', createTestDossierForParcours(ParcoursCode::GriefSousTraitant->value)))->toBeTrue();
    expect($correspondant->can('view', createTestDossierForParcours(ParcoursCode::GriefCommunaute->value)))->toBeTrue();
    expect($correspondant->can('view', createTestDossierForParcours(ParcoursCode::EiEmploye->value)))->toBeFalse();
});

it('lets service_mgp, dg and auditeur view dossiers across all 4 parcours', function () {
    foreach (['service_mgp', 'dg', 'auditeur'] as $roleName) {
        $user = User::factory()->create();
        $user->assignRole($roleName);

        foreach (ParcoursCode::cases() as $parcours) {
            expect($user->can('view', createTestDossierForParcours($parcours->value)))
                ->toBeTrue("Le rôle {$roleName} devrait voir le parcours {$parcours->value}.");
        }
    }
});

it('never grants administrateur_digital access to any dossier (DT-02)', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');

    foreach (ParcoursCode::cases() as $parcours) {
        expect($admin->can('view', createTestDossierForParcours($parcours->value)))->toBeFalse();
    }
});

it('lets an employe_declarant view only their own, non-anonymous dossier', function () {
    $employe = User::factory()->create();
    $employe->assignRole('employe_declarant');

    $sonDossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $sonDossier->update(['declarant_user_id' => $employe->id, 'is_anonymous' => false]);

    $dossierAutrui = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $dossierAnonymeMaisSien = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossierAnonymeMaisSien->update(['declarant_user_id' => null, 'is_anonymous' => true]);

    expect($employe->can('view', $sonDossier->fresh()))->toBeTrue();
    expect($employe->can('view', $dossierAutrui))->toBeFalse();
    expect($employe->can('view', $dossierAnonymeMaisSien->fresh()))->toBeFalse();
});

it('only grants dossiers.reopen-backed reopen ability to service_mgp and dg', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::GriefEmploye->value);

    $serviceMgp = User::factory()->create();
    $serviceMgp->assignRole('service_mgp');
    expect($serviceMgp->can('reopen', $dossier))->toBeTrue();

    $correspondant = User::factory()->create();
    $correspondant->assignRole('correspondant_mgp');
    expect($correspondant->can('reopen', $dossier))->toBeFalse();
});
