<?php

namespace Database\Factories;

use App\Enums\ExpediteurType;
use App\Models\Dossier;
use App\Models\Message;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Message>
 */
class MessageFactory extends Factory
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
            'expediteur_type' => ExpediteurType::Declarant->value,
            'expediteur_user_id' => null,
            'corps' => $this->faker->paragraph(),
            'lu_le' => null,
        ];
    }
}
