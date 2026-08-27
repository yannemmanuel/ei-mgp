<?php

namespace App\Policies;

use App\Models\ActionCorrective;
use App\Models\User;
use App\Support\RoleParcoursScope;

class ActionCorrectivePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('actions.view');
    }

    public function view(User $user, ActionCorrective $action): bool
    {
        return $user->can('actions.view')
            && RoleParcoursScope::peutVoirParcours($user, $action->dossier->parcours->code);
    }

    public function create(User $user, ActionCorrective $action): bool
    {
        return $user->can('actions.create')
            && RoleParcoursScope::peutVoirParcours($user, $action->dossier->parcours->code);
    }

    public function update(User $user, ActionCorrective $action): bool
    {
        return $user->can('actions.update')
            && RoleParcoursScope::peutVoirParcours($user, $action->dossier->parcours->code);
    }

    public function verifyEfficacite(User $user, ActionCorrective $action): bool
    {
        return $user->can('actions.verify_efficacite')
            && RoleParcoursScope::peutVoirParcours($user, $action->dossier->parcours->code);
    }

    public function close(User $user, ActionCorrective $action): bool
    {
        return $user->can('actions.close')
            && RoleParcoursScope::peutVoirParcours($user, $action->dossier->parcours->code);
    }
}
