<?php

namespace Database\Factories;

use App\Models\CanalCaptage;
use App\Models\Categorie;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\StatutDossier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Dossier>
 */
class DossierFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'reference' => strtoupper('TST-'.now()->year.'-'.$this->faker->unique->numerify('######')),
            'parcours_id' => Parcours::factory(),
            'categorie_id' => Categorie::factory(),
            'niveau_gravite_id' => NiveauGravite::factory(),
            'statut_id' => StatutDossier::factory(),
            'canal_captage_id' => CanalCaptage::factory(),
            'is_anonymous' => false,
            'access_code_hash' => null,
            'site_id' => null,
            'direction_id' => null,
            'declarant_user_id' => null,
            'description' => $this->faker->paragraph(),
            'lieu' => $this->faker->city(),
            'date_survenance' => $this->faker->dateTimeBetween('-1 month', 'now'),
            'attentes_declarant' => null,
            'synthese_resolution' => null,
            'motif_reouverture' => null,
            'motif_rejet' => null,
            'date_cloture' => null,
        ];
    }

    /** Anonyme : jamais de déclarant identifié ni de champs d'identité (RG-06). */
    public function anonyme(): static
    {
        return $this->state(fn () => [
            'is_anonymous' => true,
            'declarant_user_id' => null,
            'access_code_hash' => bcrypt((string) random_int(1000, 999999)),
        ]);
    }

    /**
     * Réutilise la ligne "Critique" existante (seedée ou déjà créée dans le test) plutôt que
     * d'en recréer une à chaque appel : niveaux_gravite.niveau est unique (échelle à 4 valeurs
     * verrouillée, CDC §11.1).
     */
    public function critique(): static
    {
        return $this->state(fn () => [
            'niveau_gravite_id' => NiveauGravite::query()->firstOrCreate(
                ['niveau' => 4],
                NiveauGravite::factory()->critique()->make()->toArray()
            )->id,
        ]);
    }
}
