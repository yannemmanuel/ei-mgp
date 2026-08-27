<?php

namespace Database\Factories;

use App\Enums\CanalCaptageCode;
use App\Models\CanalCaptage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CanalCaptage>
 */
class CanalCaptageFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => $this->faker->unique->randomElement(CanalCaptageCode::cases())->value,
            'libelle' => $this->faker->unique->words(2, true),
            'actif' => true,
        ];
    }
}
