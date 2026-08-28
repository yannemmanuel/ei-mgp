<?php

namespace App\Notifications;

use App\Enums\CanalNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Notification générique pilotée par un gabarit `notification_templates` (Module 5) : le
 * contenu (objet/corps) est toujours résolu et rendu en amont par
 * App\Services\Notification\NotificationService, jamais codé en dur ici. Une seule classe sert
 * tous les événements EX-NOT-01 à 05, distingués uniquement par $evenementCode (utile pour le
 * canal "outil", stocké dans notifications.data).
 *
 * Mise en file par défaut (EX-NOT-03 précise « queue »). Le circuit accéléré (EX-NOT-05, RG-08)
 * l'envoie via NotificationService::envoyerImmediat(), qui appelle Notification::sendNow() pour
 * contourner explicitement la file — cf. docs/decisions-techniques.md DT-28.
 */
class DossierEvenementNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly CanalNotification $canalCible,
        public readonly string $objet,
        public readonly string $corps,
        public readonly string $evenementCode,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return [$this->canalCible === CanalNotification::Email ? 'mail' : 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)->subject($this->objet)->line($this->corps);
    }

    /** @return array<string, string> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'evenement_code' => $this->evenementCode,
            'objet' => $this->objet,
            'corps' => $this->corps,
        ];
    }
}
