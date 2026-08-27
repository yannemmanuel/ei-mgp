<?php

namespace App\Policies;

use App\Models\Investigation;
use App\Models\User;
use App\Support\RoleParcoursScope;

class InvestigationPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('investigations.view');
    }

    public function view(User $user, Investigation $investigation): bool
    {
        return $user->can('investigations.view')
            && RoleParcoursScope::peutVoirParcours($user, $investigation->dossier->parcours->code);
    }

    public function create(User $user, Investigation $investigation): bool
    {
        return $user->can('investigations.create')
            && RoleParcoursScope::peutVoirParcours($user, $investigation->dossier->parcours->code);
    }

    public function update(User $user, Investigation $investigation): bool
    {
        return $user->can('investigations.update')
            && RoleParcoursScope::peutVoirParcours($user, $investigation->dossier->parcours->code);
    }

    /** RGI-06 : la validation ne peut jamais être effectuée par l'enquêteur lui-même. */
    public function validateInvestigation(User $user, Investigation $investigation): bool
    {
        return $user->can('investigations.validate')
            && $investigation->enqueteur_id !== $user->id
            && RoleParcoursScope::peutVoirParcours($user, $investigation->dossier->parcours->code);
    }
}
