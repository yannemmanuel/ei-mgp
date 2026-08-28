<?php

namespace App\Listeners;

use App\Events\StatutDossierChange;
use App\Services\Notification\NotificationService;

/**
 * EX-NOT-02 : notification au déclarant identifié à chaque changement de statut MAJEUR — c'est-à-
 * dire un changement visible du statut AFFICHÉ (RGI-10), pas de chaque transition interne (deux
 * statuts internes différents peuvent partager le même libellé affiché, ex. "En investigation" et
 * "En attente d'information complémentaire" → "En traitement"). Cf. docs/decisions-techniques.md
 * DT-28. Aucune notification pour un déclarant anonyme (RG-06) : il suit son dossier via /suivi.
 */
class EnvoyerNotificationStatutChange
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(StatutDossierChange $event): void
    {
        if ($event->dossier->declarant_user_id === null) {
            return;
        }

        if ($event->precedent->libelle_affiche === $event->suivant->libelle_affiche) {
            return;
        }

        $this->notifications->envoyer(
            'statut_change',
            $event->dossier,
            [$event->dossier->declarant],
            ['statut' => $event->suivant->libelle_affiche],
        );
    }
}
