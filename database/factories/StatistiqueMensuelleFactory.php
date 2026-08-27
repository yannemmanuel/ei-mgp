<?php

namespace Database\Factories;

use App\Models\StatistiqueMensuelle;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StatistiqueMensuelle>
 */
class StatistiqueMensuelleFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $declarations = $this->faker->numberBetween(5, 50);
        $resolues = $this->faker->numberBetween(0, $declarations);
        $cloturees = $this->faker->numberBetween(0, $resolues);

        return [
            'periode' => now()->startOfMonth(),
            'parcours_id' => null,
            'categorie_id' => null,
            'niveau_gravite_id' => null,
            'nb_declarations' => $declarations,
            'nb_resolues' => $resolues,
            'nb_cloturees' => $cloturees,
            'delai_moyen_jours' => $this->faker->randomFloat(2, 1, 60),
            'taux_resolution' => $declarations > 0 ? round($resolues / $declarations * 100, 2) : 0,
            'taux_cloture' => $declarations > 0 ? round($cloturees / $declarations * 100, 2) : 0,
        ];
    }
}
