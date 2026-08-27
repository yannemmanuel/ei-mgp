<?php

namespace Database\Factories;

use App\Models\Dossier;
use App\Models\PieceJointe;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PieceJointe>
 */
class PieceJointeFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $nom = $this->faker->word().'.jpg';

        return [
            'attachable_type' => Dossier::class,
            'attachable_id' => Dossier::factory(),
            'disque' => 'local',
            'chemin' => 'pieces-jointes/'.$this->faker->uuid().'/'.$nom,
            'nom_original' => $nom,
            'mime_type' => 'image/jpeg',
            'taille_octets' => $this->faker->numberBetween(1_000, 5_000_000),
            'checksum_sha256' => hash('sha256', $this->faker->uuid()),
            'televerse_par' => null,
        ];
    }
}
