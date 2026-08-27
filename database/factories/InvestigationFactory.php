<?php

namespace Database\Factories;

use App\Enums\StatutInvestigation;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Investigation>
 */
class InvestigationFactory extends Factory
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
            'enqueteur_id' => User::factory(),
            'date_ouverture' => $this->faker->dateTimeBetween('-1 month', 'now'),
            'faits_constates' => $this->faker->paragraph(),
            'personnes_rencontrees' => null,
            'cause_immediate' => null,
            'causes_racines' => null,
            'recommandations' => $this->faker->paragraph(),
            'statut' => StatutInvestigation::EnCours->value,
            'valide_par' => null,
            'valide_le' => null,
        ];
    }
}
