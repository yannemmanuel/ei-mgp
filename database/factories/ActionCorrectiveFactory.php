<?php

namespace Database\Factories;

use App\Enums\StatutActionCorrective;
use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ActionCorrective>
 */
class ActionCorrectiveFactory extends Factory
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
            'investigation_id' => null,
            'intitule' => $this->faker->sentence(4),
            'description' => $this->faker->paragraph(),
            'responsable_id' => User::factory(),
            'echeance' => $this->faker->dateTimeBetween('now', '+1 month'),
            'statut' => StatutActionCorrective::NonDemarree->value,
            'verification_efficacite' => null,
            'verification_commentaire' => null,
            'date_cloture' => null,
        ];
    }
}
