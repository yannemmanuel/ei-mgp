<?php

use App\Enums\ParcoursCode;
use App\Models\User;
use App\Notifications\DossierEvenementNotification;
use App\Services\Workflow\DelaiService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => seedReferentiels());

afterEach(fn () => CarbonImmutable::setTestNow());

it('alerte le N+1 du responsable et le Service MGP dès que l\'échéance est dépassée (EX-NOT-04)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));

    $n1 = User::factory()->create();
    $acteur = User::factory()->create(['responsable_hierarchique_id' => $n1->id]);
    $chefMgp = User::factory()->create();
    $chefMgp->assignRole('service_mgp');

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $acteur);
    $limite = app(DelaiService::class)->dateLimite($dossier->fresh());

    // Juste après l'échéance : dépassement > 0 % mais très inférieur à 50 %.
    CarbonImmutable::setTestNow($limite->addHour());

    Notification::fake();
    $this->artisan('dossiers:detecter-retards')->assertSuccessful();

    Notification::assertSentTo($n1, DossierEvenementNotification::class, fn ($n) => $n->evenementCode === 'alerte_retard_n1');
    Notification::assertSentTo($chefMgp, DossierEvenementNotification::class, fn ($n) => $n->evenementCode === 'alerte_retard_service_mgp');
    Notification::assertNotSentTo($chefMgp, DossierEvenementNotification::class, fn ($n) => $n->evenementCode === 'alerte_retard_direction');
});

it('alerte en plus la Direction Générale une fois le dépassement à +50 % (EX-NOT-04)', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));

    $acteur = User::factory()->create();
    $dg = User::factory()->create();
    $dg->assignRole('dg');

    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $acteur);
    $debut = app(DelaiService::class)->dateDebutEtape($dossier->fresh());
    $limite = app(DelaiService::class)->dateLimite($dossier->fresh());
    $dureeAllouee = $debut->diffInSeconds($limite);

    // +60 % de la durée allouée au-delà de l'échéance : dépasse le seuil des 50 %.
    CarbonImmutable::setTestNow($limite->addSeconds((int) ($dureeAllouee * 0.6)));

    Notification::fake();
    $this->artisan('dossiers:detecter-retards')->assertSuccessful();

    Notification::assertSentTo($dg, DossierEvenementNotification::class, fn ($n) => $n->evenementCode === 'alerte_retard_direction');
});

it('ne déclenche aucune alerte tant que l\'échéance n\'est pas dépassée', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-08-28 10:00:00'));

    $acteur = User::factory()->create();
    $dossier = amenerDossierEnInvestigation(ParcoursCode::GriefEmploye->value, $acteur);

    Notification::fake();
    $this->artisan('dossiers:detecter-retards')->assertSuccessful();

    Notification::assertNothingSent();
});
