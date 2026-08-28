<?php

use App\Enums\CanalNotification;
use App\Enums\ParcoursCode;
use App\Models\NotificationTemplate;
use App\Models\Parcours;
use App\Models\User;
use App\Notifications\DossierEvenementNotification;
use App\Services\Notification\NotificationService;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

beforeEach(fn () => seedReferentiels());

it('sends to the "outil" (database) channel for a User destinataire, rendering placeholders', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $utilisateur = User::factory()->create();

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event',
        'parcours_id' => null,
        'canal' => CanalNotification::Outil->value,
        'objet' => 'Dossier {reference}',
        'corps' => '{parcours} - {reference}',
        'actif' => true,
    ]);

    app(NotificationService::class)->envoyer('test_event', $dossier, [$utilisateur]);

    Notification::assertSentTo($utilisateur, DossierEvenementNotification::class, function ($notification) use ($dossier) {
        return $notification->objet === "Dossier {$dossier->reference}"
            && $notification->canalCible === CanalNotification::Outil;
    });
});

it('sends to the "email" channel, including a raw email address destinataire', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event',
        'parcours_id' => null,
        'canal' => CanalNotification::Email->value,
        'objet' => 'Objet {reference}',
        'corps' => 'Corps.',
        'actif' => true,
    ]);

    app(NotificationService::class)->envoyer('test_event', $dossier, ['externe@example.test']);

    Notification::assertSentOnDemand(DossierEvenementNotification::class, function ($notification, $channels, $notifiable) {
        return ($notifiable->routes['mail'] ?? null) === 'externe@example.test';
    });
});

it('prefers a parcours-specific template over the global one for the same canal', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();
    $utilisateur = User::factory()->create();

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => null,
        'canal' => CanalNotification::Outil->value, 'objet' => 'Global', 'corps' => 'Global.', 'actif' => true,
    ]);
    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => $parcours->id,
        'canal' => CanalNotification::Outil->value, 'objet' => 'Spécifique EI', 'corps' => 'Spécifique.', 'actif' => true,
    ]);

    app(NotificationService::class)->envoyer('test_event', $dossier, [$utilisateur]);

    Notification::assertSentTo($utilisateur, DossierEvenementNotification::class, fn ($n) => $n->objet === 'Spécifique EI');
});

it('does nothing when no active template exists for the event', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    app(NotificationService::class)->envoyer('evenement_inconnu', $dossier, [User::factory()->create()]);

    Notification::assertNothingSent();
});

it('only routes destinataires_email_supplementaires for the "email" canal, never "outil"', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => null,
        'canal' => CanalNotification::Outil->value, 'objet' => 'Outil', 'corps' => 'Outil.', 'actif' => true,
    ]);
    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => null,
        'canal' => CanalNotification::Email->value, 'objet' => 'Email', 'corps' => 'Email.', 'actif' => true,
        'destinataires_email_supplementaires' => ['groupe@example.test'],
    ]);

    app(NotificationService::class)->envoyer('test_event', $dossier, []);

    Notification::assertSentOnDemand(DossierEvenementNotification::class, function ($notification, $channels, $notifiable) {
        return ($notifiable->routes['mail'] ?? null) === 'groupe@example.test' && $notification->objet === 'Email';
    });
    Notification::assertCount(1);
});

it('queues via envoyer() but bypasses the queue via envoyerImmediat() (RG-08)', function () {
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $utilisateur = User::factory()->create();

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => null,
        'canal' => CanalNotification::Outil->value, 'objet' => 'Objet', 'corps' => 'Corps.', 'actif' => true,
    ]);

    Queue::fake();
    app(NotificationService::class)->envoyer('test_event', $dossier, [$utilisateur]);
    Queue::assertPushed(SendQueuedNotifications::class);

    Queue::fake();
    app(NotificationService::class)->envoyerImmediat('test_event', $dossier, [$utilisateur]);
    Queue::assertNothingPushed();
});
