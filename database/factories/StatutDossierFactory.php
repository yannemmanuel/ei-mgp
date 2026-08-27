<?php

namespace Database\Factories;

use App\Enums\StatutDossierCode;
use App\Models\StatutDossier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StatutDossier>
 */
class StatutDossierFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => $this->faker->unique->randomElement(StatutDossierCode::cases())->value,
            'libelle_interne' => $this->faker->unique->words(2, true),
            'libelle_affiche' => $this->faker->randomElement(['Reçu', 'En cours d\'analyse', 'En traitement', 'Résolu', 'Clôturé']),
            'is_terminal' => false,
            'ordre' => $this->faker->numberBetween(1, 10),
        ];
    }
}
