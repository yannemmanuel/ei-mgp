<?php

namespace Database\Factories;

use App\Enums\UniteDelai;
use App\Models\Parcours;
use App\Models\SlaDelai;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SlaDelai>
 */
class SlaDelaiFactory extends Factory
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
            'etape_code' => $this->faker->unique->slug(2),
            'valeur' => $this->faker->numberBetween(1, 30),
            'unite' => $this->faker->randomElement(UniteDelai::cases())->value,
            'est_valide_metier' => true,
            'notes' => null,
        ];
    }
}
