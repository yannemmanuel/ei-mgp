<?php

use App\Enums\ParcoursCode;
use App\Models\User;
use App\Notifications\DossierEvenementNotification;
use App\Services\Workflow\DelaiService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => seedReferentiels());

afterEach(fn () => CarbonImmutable::setTestNow());

it('relance les responsables actuels exactement à J-3 (EX-NOT-03)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));

    $acteur = User::factory()->create();
    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $acteur);
    // Grief Employé "traitement_enquete" = 1 mois, est_valide_metier=true (SlaDelaiSeeder).
    $limite = app(DelaiService::class)->dateLimite($dossier->fresh());

    CarbonImmutable::setTestNow($limite->subDays(3));

    Notification::fake();
    $this->artisan('dossiers:relancer-echeances')->assertSuccessful();

    Notification::assertSentTo($acteur, DossierEvenementNotification::class, function ($notification) {
        return $notification->evenementCode === 'relance_echeance';
    });
});

it('ne relance pas un dossier dont l\'échéance n\'est pas exactement à J-3', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));

    $acteur = User::factory()->create();
    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $acteur);
    $limite = app(DelaiService::class)->dateLimite($dossier->fresh());

    CarbonImmutable::setTestNow($limite->subDays(4));

    Notification::fake();
    $this->artisan('dossiers:relancer-echeances')->assertSuccessful();

    Notification::assertNotSentTo($acteur, DossierEvenementNotification::class);
});
