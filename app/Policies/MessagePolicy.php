<?php

namespace App\Policies;

use App\Models\Message;
use App\Models\User;
use App\Support\RoleParcoursScope;

/**
 * Côté acteur authentifié uniquement (Correspondant MGP / Enquêteur, etc.). L'accès du
 * déclarant — y compris anonyme — à la messagerie de son propre dossier ne passe pas par
 * cette Policy : il s'authentifie par référence + code de suivi, pas par un compte
 * utilisateur (RG-06, cf. Phase 5).
 */
class MessagePolicy
{
    public function view(User $user, Message $message): bool
    {
        return $user->can('messagerie.view')
            && RoleParcoursScope::peutVoirParcours($user, $message->dossier->parcours->code);
    }

    public function create(User $user, Message $message): bool
    {
        return $user->can('messagerie.send')
            && RoleParcoursScope::peutVoirParcours($user, $message->dossier->parcours->code);
    }
}
