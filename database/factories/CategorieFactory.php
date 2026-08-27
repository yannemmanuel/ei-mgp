<?php

namespace Database\Factories;

use App\Models\Categorie;
use App\Models\Parcours;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Categorie>
 */
class CategorieFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'parcours_id' => Parcours::factory(),
            'code' => $this->faker->unique->slug(2),
            'libelle' => $this->faker->unique->words(3, true),
            'is_autre' => false,
            'actif' => true,
            'ordre' => $this->faker->numberBetween(1, 10),
        ];
    }

    public function autre(): static
    {
        return $this->state(fn () => [
            'code' => 'autre',
            'libelle' => 'Autre',
            'is_autre' => true,
        ]);
    }
}
