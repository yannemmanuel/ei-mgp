<?php

use App\Enums\ParcoursCode;
use App\Enums\StatutActionCorrective;
use App\Models\ActionCorrective;
use App\Models\User;
use Carbon\CarbonImmutable;

beforeEach(function () {
    seedReferentiels();
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));
});

afterEach(fn () => CarbonImmutable::setTestNow());

it('marks overdue actions as "en retard" via the artisan command (EX-ACT-03)', function () {
    $dossier = amenerDossierEnActionCorrective(ParcoursCode::EiEmploye->value, User::factory()->create());

    $action = ActionCorrective::factory()->create([
        'dossier_id' => $dossier->id,
        'statut' => StatutActionCorrective::NonDemarree->value,
        'echeance' => '2026-08-01',
    ]);

    $this->artisan('ei-mgp:recalculer-retard-actions-correctives')
        ->expectsOutputToContain('1 action(s)')
        ->assertSuccessful();

    expect($action->fresh()->statut)->toBe(StatutActionCorrective::EnRetard);
});
