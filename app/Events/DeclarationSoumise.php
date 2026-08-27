<?php

namespace App\Events;

use App\Models\Dossier;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Déclenché à la création de tout dossier (EX-NOT-01). Aucun listener en Phase 4 : le module
 * Notifications (Phase 9) s'y abonnera pour notifier le(s) acteur(s) affecté(s).
 */
class DeclarationSoumise
{
    use Dispatchable, SerializesModels;

    public function __construct(public Dossier $dossier) {}
}
