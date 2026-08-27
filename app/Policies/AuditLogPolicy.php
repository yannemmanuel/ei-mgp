<?php

namespace App\Policies;

use App\Models\AuditLog;
use App\Models\User;

/**
 * Lecture seule, sans exception (docs/exigences-audit.md §4). Il n'existe volontairement
 * aucune méthode update()/delete() ici : Gate::authorize('update', $log) retournera "denied"
 * par défaut faute de méthode correspondante, ce qui est le comportement souhaité.
 */
class AuditLogPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('audit.view');
    }

    public function view(User $user, AuditLog $log): bool
    {
        return $user->can('audit.view');
    }
}
