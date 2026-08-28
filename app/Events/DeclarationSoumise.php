<?php

namespace App\Events;

use App\Models\Dossier;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Déclenché à la création de tout dossier. EX-NOT-01 (notifier le(s) acteur(s) affecté(s)) est
 * finalement couvert par App\Events\DossierAffecte (Phase 9) — plus précis : il ne se déclenche
 * que lorsqu'une affectation a réellement eu lieu, et porte directement la liste des utilisateurs
 * concernés, alors que DeclarationSoumise se déclenche pour tout dossier, affecté ou non. Cet
 * évènement reste disponible sans listener pour un usage futur (ex. audit, statistiques) non
 * spécifié par le CDC.
 */
class DeclarationSoumise
{
    use Dispatchable, SerializesModels;

    public function __construct(public Dossier $dossier) {}
}
