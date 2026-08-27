<?php

namespace Database\Factories;

use App\Models\Dossier;
use App\Models\HistoriqueStatut;
use App\Models\StatutDossier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HistoriqueStatut>
 */
class HistoriqueStatutFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'dossier_id' => Dossier::factory(),
            'statut_precedent_id' => null,
            'statut_suivant_id' => StatutDossier::factory(),
            'commentaire' => null,
            'effectue_par' => null,
        ];
    }
}
