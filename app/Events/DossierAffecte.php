<?php

namespace App\Events;

use App\Models\Dossier;
use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * EX-NOT-01 : notification automatique à l'affectation d'un dossier — automatique
 * (DeclarationService, à la création) ou manuelle (AffectationService, réaffectation).
 */
class DossierAffecte
{
    use Dispatchable, SerializesModels;

    /** @param  Collection<int, User>  $utilisateurs */
    public function __construct(public Dossier $dossier, public Collection $utilisateurs) {}
}
