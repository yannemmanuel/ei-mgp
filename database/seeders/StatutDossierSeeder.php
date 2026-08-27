<?php

namespace Database\Seeders;

use App\Enums\StatutDossierCode;
use App\Models\StatutDossier;
use Illuminate\Database\Seeder;

/**
 * Statuts internes et leur projection vers le statut affiché au déclarant (CDC §7.1/§7.2).
 * "Brouillon" et "Soumis" ne sont volontairement pas seedés ici : ils ne sont jamais persistés
 * (cf. docs/decisions-techniques.md DT-05).
 */
class StatutDossierSeeder extends Seeder
{
    public function run(): void
    {
        $statuts = [
            [StatutDossierCode::Recu, 'Reçu', 'Reçu', false, 1],
            [StatutDossierCode::Affecte, 'Affecté', 'Reçu', false, 2],
            [StatutDossierCode::EnAnalyse, 'En analyse', 'En cours d\'analyse', false, 3],
            [StatutDossierCode::EnInvestigation, 'En investigation', 'En traitement', false, 4],
            [StatutDossierCode::EnAttenteInformation, 'En attente d\'information complémentaire', 'En traitement', false, 5],
            [StatutDossierCode::ActionCorrectiveEnCours, 'Action corrective en cours', 'En traitement', false, 6],
            [StatutDossierCode::Resolu, 'Résolu', 'Résolu', false, 7],
            [StatutDossierCode::Cloture, 'Clôturé', 'Clôturé', true, 8],
            [StatutDossierCode::Reouvert, 'Réouvert', 'En traitement', false, 9],
            [StatutDossierCode::Rejete, 'Rejeté (non recevable)', 'Clôturé', true, 10],
        ];

        foreach ($statuts as [$code, $libelleInterne, $libelleAffiche, $terminal, $ordre]) {
            StatutDossier::query()->updateOrCreate(
                ['code' => $code->value],
                [
                    'libelle_interne' => $libelleInterne,
                    'libelle_affiche' => $libelleAffiche,
                    'is_terminal' => $terminal,
                    'ordre' => $ordre,
                ]
            );
        }
    }
}
