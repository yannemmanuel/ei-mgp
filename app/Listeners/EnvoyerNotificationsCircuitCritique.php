<?php

namespace App\Listeners;

use App\Events\DeclarationCritique;
use App\Models\User;
use App\Services\Notification\NotificationService;

/**
 * RG-08 / EX-NOT-05 : circuit accéléré. Matrice de destinataires reprise exacte du CDC §6.5
 * (docs/regles-metier.md §C) — « Président CSST » résolu via l'attribut `poste` (DT-07), « Service
 * Prévention » et « toutes les Directions » via `destinataires_email_supplementaires` du gabarit
 * `circuit_critique` propre à leur parcours (DT-28), pas via un rôle RBAC inexistant.
 *
 * Envoi synchrone (NotificationService::envoyerImmediat) : jamais de file d'attente, conformément
 * à RG-08 (« indépendant de l'heure », ne doit pas attendre un worker de queue).
 */
class EnvoyerNotificationsCircuitCritique
{
    /** @var array<string, list<string>> */
    private const ROLES_PAR_PARCOURS = [
        'ei_employe' => ['rqse', 'secretaire_csst'],
        'grief_employe' => ['correspondant_mgp', 'responsable_grief_employe', 'service_mgp', 'dg'],
        'grief_sous_traitant' => ['correspondant_mgp', 'captage_grief_soustraitant', 'service_mgp', 'dg'],
        'grief_communaute' => ['service_mgp', 'dg'],
    ];

    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(DeclarationCritique $event): void
    {
        $dossier = $event->dossier;
        $codeParcours = $dossier->parcours->code->value;

        $roles = self::ROLES_PAR_PARCOURS[$codeParcours];

        $destinataires = User::query()
            ->role($roles)
            ->where('actif', true)
            ->get();

        // EI Employé : « Président CSST (Directeur de structure) » — cf. docs/decisions-techniques.md DT-07.
        if ($codeParcours === 'ei_employe') {
            $destinataires = $destinataires->merge(
                User::query()->where('poste', 'Directeur de structure')->where('actif', true)->get()
            )->unique('id');
        }

        $this->notifications->envoyerImmediat('circuit_critique', $dossier, $destinataires);
    }
}
