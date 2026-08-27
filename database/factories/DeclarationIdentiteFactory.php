<?php

namespace Database\Factories;

use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DeclarationIdentite>
 */
class DeclarationIdentiteFactory extends Factory
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
            'nom_prenom' => $this->faker->name(),
            'matricule' => $this->faker->unique->numerify('EMP-#####'),
            'entreprise' => null,
            'fonction' => $this->faker->jobTitle(),
            'anciennete_annees' => $this->faker->numberBetween(0, 30),
            'localite' => null,
            'statut_plaignant' => null,
            'contact_email' => $this->faker->safeEmail(),
            'contact_telephone' => $this->faker->phoneNumber(),
            'souhait_recontact' => true,
            'canal_retour_prefere' => $this->faker->randomElement(['email', 'telephone', 'entretien']),
            'personnes_impliquees' => null,
            'temoins' => null,
            'consentement_rgpd' => null,
        ];
    }
}
