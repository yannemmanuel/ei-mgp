<?php

namespace Database\Seeders;

use App\Enums\ParcoursCode;
use App\Models\Parcours;
use Illuminate\Database\Seeder;

/**
 * Les 4 parcours du CDC (§2.1). Référentiel figé : ce seeder est idempotent (updateOrCreate)
 * et peut être rejoué sans dupliquer de lignes.
 */
class ParcoursSeeder extends Seeder
{
    public function run(): void
    {
        $parcours = [
            ['code' => ParcoursCode::EiEmploye, 'libelle' => 'Événement Indésirable (Employé)', 'ordre' => 1],
            ['code' => ParcoursCode::GriefEmploye, 'libelle' => 'Grief / plainte (Employé)', 'ordre' => 2],
            ['code' => ParcoursCode::GriefSousTraitant, 'libelle' => 'Grief / plainte (Sous-traitant)', 'ordre' => 3],
            ['code' => ParcoursCode::GriefCommunaute, 'libelle' => 'Grief / plainte (Communauté)', 'ordre' => 4],
        ];

        foreach ($parcours as $p) {
            Parcours::query()->updateOrCreate(
                ['code' => $p['code']->value],
                ['libelle' => $p['libelle'], 'ordre' => $p['ordre'], 'actif' => true]
            );
        }
    }
}
