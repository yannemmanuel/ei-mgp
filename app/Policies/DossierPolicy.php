<?php

namespace App\Policies;

use App\Models\Dossier;
use App\Models\User;
use App\Support\RoleParcoursScope;

/**
 * Autorisation d'accès aux dossiers (docs/acteurs.md, RG-14). Toute vérification passe par
 * cette classe : aucune vue/contrôleur/composant Livewire ne doit dupliquer cette logique.
 */
class DossierPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyPermission(['dossiers.view', 'dossiers.view.all', 'dossiers.view.own']);
    }

    public function view(User $user, Dossier $dossier): bool
    {
        if ($user->hasRole('employe_declarant')) {
            return ! $dossier->is_anonymous && $dossier->declarant_user_id === $user->id;
        }

        if ($user->can('dossiers.view.all')) {
            return true;
        }

        if ($user->can('dossiers.view') || $user->can('dossiers.view.own')) {
            return RoleParcoursScope::peutVoirParcours($user, $dossier->parcours->code);
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->can('dossiers.create');
    }

    public function assign(User $user, Dossier $dossier): bool
    {
        return $user->can('dossiers.assign') && $this->view($user, $dossier);
    }

    public function reassign(User $user, Dossier $dossier): bool
    {
        return $user->can('dossiers.reassign') && $this->view($user, $dossier);
    }

    public function updateStatus(User $user, Dossier $dossier): bool
    {
        return $user->can('dossiers.status.update') && $this->view($user, $dossier);
    }

    public function close(User $user, Dossier $dossier): bool
    {
        return $user->can('dossiers.close') && $this->view($user, $dossier);
    }

    /** RG-07 : réservé à Service MGP/DADD et DG — garanti par la permission dossiers.reopen,
     *  accordée uniquement à ces deux rôles dans RolePermissionSeeder. */
    public function reopen(User $user, Dossier $dossier): bool
    {
        return $user->can('dossiers.reopen') && $this->view($user, $dossier);
    }
}
