<?php

namespace Database\Seeders;

use App\Enums\ParcoursCode;
use App\Models\Categorie;
use App\Models\Parcours;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Catégories par parcours, reprises intégralement des formulaires du CDC (§9.1 "Nature de
 * l'EI", §9.2, §9.3, §9.4). La catégorie "Autre" de chaque parcours porte is_autre = true et
 * est orientée par défaut vers le Service MGP/DADD (RG-09, CDC §6.8).
 */
class CategorieSeeder extends Seeder
{
    public function run(): void
    {
        $categoriesParParcours = [
            ParcoursCode::EiEmploye->value => [
                'Situation dangereuse',
                'Condition dangereuse',
                'Incident environnemental',
                'Incident matériel',
                'Presque-accident',
                'Autre',
            ],
            ParcoursCode::GriefEmploye->value => [
                'Conditions de travail',
                'Rémunération',
                'Relations hiérarchie',
                'Harcèlement',
                'Discrimination',
                'Conflit collègues',
                'Charge de travail',
                'Non-respect de procédures',
                'Autre',
            ],
            ParcoursCode::GriefSousTraitant->value => [
                'Conditions de travail',
                'Paiement',
                'Sécurité HSE',
                'Harcèlement/discrimination',
                'Environnement',
                'Relation contractuelle',
                'Corruption/éthique',
                'Autre',
            ],
            ParcoursCode::GriefCommunaute->value => [
                'Environnement',
                'Foncier',
                'Emploi local',
                'Nuisances',
                'Dommages aux biens',
                'Comportement du personnel',
                'Sécurité',
                'Indemnisation',
                'Autre',
            ],
        ];

        foreach ($categoriesParParcours as $parcoursCode => $libelles) {
            $parcours = Parcours::query()->where('code', $parcoursCode)->firstOrFail();

            foreach ($libelles as $ordre => $libelle) {
                $isAutre = $libelle === 'Autre';

                Categorie::query()->updateOrCreate(
                    ['parcours_id' => $parcours->id, 'code' => Str::slug($libelle)],
                    [
                        'libelle' => $libelle,
                        'is_autre' => $isAutre,
                        'actif' => true,
                        'ordre' => $ordre + 1,
                    ]
                );
            }
        }
    }
}
