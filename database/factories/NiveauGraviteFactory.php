<?php

namespace Database\Factories;

use App\Enums\EffetCircuit;
use App\Enums\NiveauGraviteCode;
use App\Models\NiveauGravite;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Échelle figée à 4 niveaux (CDC §11.1) : préférer database/seeders/NiveauGraviteSeeder.php
 * dans les tests d'intégration.
 *
 * @extends Factory<NiveauGravite>
 */
class NiveauGraviteFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'niveau' => $this->faker->unique->numberBetween(1, 4),
            'code' => $this->faker->unique->randomElement(NiveauGraviteCode::cases())->value,
            'libelle' => $this->faker->unique->word(),
            'effet_circuit' => EffetCircuit::Standard->value,
            'couleur' => $this->faker->safeHexColor(),
            'actif' => true,
        ];
    }

    public function critique(): static
    {
        return $this->state(fn () => [
            'niveau' => 4,
            'code' => NiveauGraviteCode::Critique->value,
            'libelle' => 'Critique',
            'effet_circuit' => EffetCircuit::Accelere->value,
        ]);
    }
}
