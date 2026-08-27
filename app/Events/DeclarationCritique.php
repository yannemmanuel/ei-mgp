<?php

namespace App\Events;

use App\Models\Dossier;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * RG-08 / EX-NOT-05 : circuit accéléré, déclenché immédiatement et de façon synchrone (jamais
 * en file d'attente) dès qu'un dossier est classé « Critique », quels que soient l'heure ou le
 * jour. Aucun listener en Phase 4 : le module Notifications (Phase 9) implémentera la
 * notification immédiate (<12h) de la matrice de destinataires (docs/regles-metier.md §C).
 */
class DeclarationCritique
{
    use Dispatchable, SerializesModels;

    public function __construct(public Dossier $dossier) {}
}
