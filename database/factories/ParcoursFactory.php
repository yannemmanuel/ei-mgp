<?php

namespace Database\Factories;

use App\Enums\ParcoursCode;
use App\Models\Parcours;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Les 4 parcours étant un référentiel figé (docs/decisions-techniques.md), préférer
 * database/seeders/ParcoursSeeder.php dans les tests d'intégration. Cette factory reste utile
 * pour les tests unitaires isolés qui n'ont besoin que d'un parcours quelconque.
 *
 * @extends Factory<Parcours>
 */
class ParcoursFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => $this->faker->unique->randomElement(ParcoursCode::cases())->value,
            'libelle' => $this->faker->unique->words(3, true),
            'actif' => true,
            'ordre' => $this->faker->numberBetween(1, 4),
        ];
    }
}
