<?php

namespace App\Services\Dossier;

use App\Enums\StatutDossierCode;
use App\Enums\TypeAffectation;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\User;
use App\Services\Workflow\DossierWorkflowService;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * EX-GES-03 : réaffectation manuelle, motif obligatoire, tracée. Remplace le(s) titulaire(s)
 * actif(s) plutôt que d'en ajouter un de plus (une réaffectation change le responsable, elle ne
 * l'étend pas) — l'affectation automatique multi-utilisateurs de Phase 4 reste, elle, inchangée.
 */
class AffectationService
{
    public function __construct(private readonly DossierWorkflowService $workflow) {}

    public function reaffecter(Dossier $dossier, User $nouvelUtilisateur, User $effectuePar, string $motif): void
    {
        // EX-GES-03 : motif obligatoire — revérifié ici (pas seulement côté formulaire) puisque
        // ce service est le point d'entrée unique de toute réaffectation.
        if (trim($motif) === '') {
            throw new RuntimeException('Le motif de réaffectation est obligatoire (EX-GES-03).');
        }

        DB::transaction(function () use ($dossier, $nouvelUtilisateur, $effectuePar, $motif) {
            DossierAffectation::query()
                ->where('dossier_id', $dossier->id)
                ->where('actif', true)
                ->update(['actif' => false, 'desaffecte_le' => now()]);

            DossierAffectation::create([
                'dossier_id' => $dossier->id,
                'user_id' => $nouvelUtilisateur->id,
                'affecte_par' => $effectuePar->id,
                'motif' => $motif,
                'type' => TypeAffectation::Reaffectation->value,
                'actif' => true,
                'affecte_le' => now(),
            ]);

            // Un dossier encore au statut "Reçu" (aucun titulaire à la création, cf. Phase 4)
            // passe naturellement à "Affecté" dès qu'un responsable lui est assigné.
            if ($dossier->statut->code === StatutDossierCode::Recu) {
                $this->workflow->changerStatut($dossier, StatutDossierCode::Affecte, $effectuePar, 'Affectation manuelle : '.$motif);
            }
        });
    }
}
