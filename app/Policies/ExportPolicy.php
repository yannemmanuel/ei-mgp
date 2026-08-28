<?php

namespace App\Policies;

use App\Models\User;

/**
 * EX-REP-06 : restriction des données nominatives dans les exports selon le rôle. Pas de
 * cloisonnement par parcours ici (contrairement à DossierPolicy) : les 3 rôles porteurs de
 * `reporting.export` (`service_mgp`, `dg`, `auditeur`) sont tous transversaux
 * (App\Support\RoleParcoursScope::ROLES_TRANSVERSAUX).
 */
class ExportPolicy
{
    public function export(User $user): bool
    {
        return $user->can('reporting.export');
    }

    /** Seul `service_mgp` porte `reporting.export.nominatif` — ni `dg`, ni `auditeur`. */
    public function exportNominatif(User $user): bool
    {
        return $user->can('reporting.export.nominatif');
    }
}
