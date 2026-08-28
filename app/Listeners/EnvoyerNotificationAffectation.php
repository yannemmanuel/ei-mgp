<?php

namespace App\Listeners;

use App\Events\DossierAffecte;
use App\Services\Notification\NotificationService;

/** EX-NOT-01 : notification automatique à l'affectation d'un dossier. */
class EnvoyerNotificationAffectation
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(DossierAffecte $event): void
    {
        $this->notifications->envoyer('dossier_affecte', $event->dossier, $event->utilisateurs);
    }
}
