<?php

namespace Database\Factories;

use App\Enums\TypeAffectation;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DossierAffectation>
 */
class DossierAffectationFactory extends Factory
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
            'user_id' => User::factory(),
            'affecte_par' => null,
            'motif' => null,
            'type' => TypeAffectation::Automatique->value,
            'actif' => true,
            'affecte_le' => now(),
            'desaffecte_le' => null,
        ];
    }
}
