<?php

namespace App\Support;

use App\Enums\ParcoursCode;
use App\Models\User;

/**
 * Cloisonnement des dossiers par rôle × parcours (docs/acteurs.md §1, §2). Volontairement
 * centralisé ici plutôt que dupliqué dans chaque Policy (DossierPolicy, InvestigationPolicy,
 * ActionCorrectivePolicy) : un seul endroit à faire évoluer si le périmètre d'un rôle change.
 *
 * Les rôles absents de ROLES_PAR_PARCOURS et de ROLES_TRANSVERSAUX n'ont accès à aucun dossier
 * via cette classe (ex. administrateur_digital, agent_relais qui n'ont qu'un accès de saisie).
 */
final class RoleParcoursScope
{
    /** @var array<string, list<ParcoursCode>> */
    private const ROLES_PAR_PARCOURS = [
        'secretaire_csst' => [ParcoursCode::EiEmploye],
        'rqse' => [ParcoursCode::EiEmploye],
        'rgp' => [ParcoursCode::GriefEmploye],
        'responsable_grief_employe' => [ParcoursCode::GriefEmploye],
        'comite_ethique' => [ParcoursCode::GriefEmploye],
        'correspondant_mgp' => [
            ParcoursCode::GriefEmploye,
            ParcoursCode::GriefSousTraitant,
            ParcoursCode::GriefCommunaute,
        ],
        'captage_grief_soustraitant' => [ParcoursCode::GriefSousTraitant],
        'captage_grief_communaute' => [ParcoursCode::GriefCommunaute],
    ];

    /** Accès transverse aux 4 parcours (docs/acteurs.md §2). */
    private const ROLES_TRANSVERSAUX = ['service_mgp', 'dg', 'auditeur', 'dpo'];

    public static function peutVoirParcours(User $user, ParcoursCode $parcours): bool
    {
        foreach (self::ROLES_TRANSVERSAUX as $role) {
            if ($user->hasRole($role)) {
                return true;
            }
        }

        foreach (self::ROLES_PAR_PARCOURS as $role => $parcoursAutorises) {
            if ($user->hasRole($role) && in_array($parcours, $parcoursAutorises, true)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<ParcoursCode> Liste vide = aucun accès transverse ; null logique géré par peutVoirParcours(). */
    public static function parcoursAutorises(User $user): array
    {
        foreach (self::ROLES_TRANSVERSAUX as $role) {
            if ($user->hasRole($role)) {
                return ParcoursCode::cases();
            }
        }

        $autorises = [];
        foreach (self::ROLES_PAR_PARCOURS as $role => $parcoursDuRole) {
            if ($user->hasRole($role)) {
                array_push($autorises, ...$parcoursDuRole);
            }
        }

        return array_values(array_unique($autorises, SORT_REGULAR));
    }
}
