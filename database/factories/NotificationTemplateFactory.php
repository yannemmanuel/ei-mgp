<?php

namespace Database\Factories;

use App\Enums\CanalNotification;
use App\Models\NotificationTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationTemplate>
 */
class NotificationTemplateFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'evenement_code' => $this->faker->unique->slug(3),
            'parcours_id' => null,
            'canal' => $this->faker->randomElement(CanalNotification::cases())->value,
            'objet' => $this->faker->sentence(),
            'corps' => $this->faker->paragraph(),
            'actif' => true,
        ];
    }
}
