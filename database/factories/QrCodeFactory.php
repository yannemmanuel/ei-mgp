<?php

namespace Database\Factories;

use App\Models\Parcours;
use App\Models\QrCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<QrCode>
 */
class QrCodeFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $token = $this->faker->unique->regexify('[A-Za-z0-9]{16}');

        return [
            'parcours_id' => Parcours::factory(),
            'token' => $token,
            'url_cible' => url('/declarer/'.$token),
            'actif' => true,
            'genere_par' => null,
            'genere_le' => now(),
            'desactive_le' => null,
        ];
    }
}
