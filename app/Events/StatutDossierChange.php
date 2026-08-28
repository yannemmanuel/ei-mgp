<?php

namespace App\Events;

use App\Models\Dossier;
use App\Models\StatutDossier;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * EX-NOT-02 : notification au déclarant identifié à chaque changement de statut MAJEUR.
 * Dispatché par DossierWorkflowService::appliquerTransition() pour toute transition — c'est au
 * listener de filtrer sur le libellé affiché (RGI-10) pour ne notifier que les changements
 * réellement visibles du déclarant (cf. docs/decisions-techniques.md DT-28).
 */
class StatutDossierChange
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Dossier $dossier,
        public StatutDossier $precedent,
        public StatutDossier $suivant,
    ) {}
}
