<?php

use App\Enums\CanalNotification;
use App\Enums\ParcoursCode;
use App\Models\AuditLog;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Services\Notification\NotificationService;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => seedReferentiels());

it('audits a sent notification with its content when the dossier is not anonymous (docs/exigences-audit.md §2)', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => false]);
    $utilisateur = User::factory()->create();

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => null,
        'canal' => CanalNotification::Outil->value, 'objet' => 'Objet visible', 'corps' => 'Corps.', 'actif' => true,
    ]);

    app(NotificationService::class)->envoyer('test_event', $dossier, [$utilisateur]);

    $log = AuditLog::where('action', 'notification.envoyee')->where('auditable_id', $dossier->id)->firstOrFail();
    expect($log->new_values['objet'])->toBe('Objet visible')
        ->and($log->new_values['destinataire'])->toBe($utilisateur->email);
});

it('never records the notification content for an anonymous dossier (RG-06, exigences-audit.md §5)', function () {
    Notification::fake();

    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['is_anonymous' => true]);
    $utilisateur = User::factory()->create();

    NotificationTemplate::factory()->create([
        'evenement_code' => 'test_event', 'parcours_id' => null,
        'canal' => CanalNotification::Outil->value, 'objet' => 'Objet sensible', 'corps' => 'Corps sensible.', 'actif' => true,
    ]);

    app(NotificationService::class)->envoyer('test_event', $dossier, [$utilisateur]);

    $log = AuditLog::where('action', 'notification.envoyee')->where('auditable_id', $dossier->id)->firstOrFail();
    expect($log->new_values)->not->toHaveKey('objet')
        ->and($log->new_values)->not->toHaveKey('corps')
        ->and($log->new_values['evenement_code'])->toBe('test_event');
});
