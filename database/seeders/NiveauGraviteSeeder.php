<?php

namespace Database\Seeders;

use App\Enums\EffetCircuit;
use App\Enums\NiveauGraviteCode;
use App\Models\NiveauGravite;
use Illuminate\Database\Seeder;

/**
 * Échelle unique à 4 niveaux (CDC §11.1), verrouillée par un CHECK en base
 * (2026_08_27_210500_create_niveaux_gravite_table).
 */
class NiveauGraviteSeeder extends Seeder
{
    public function run(): void
    {
        $niveaux = [
            [1, NiveauGraviteCode::Faible, 'Faible', EffetCircuit::Standard, '#22c55e'],
            [2, NiveauGraviteCode::Modere, 'Modéré', EffetCircuit::Standard, '#eab308'],
            [3, NiveauGraviteCode::Eleve, 'Élevé', EffetCircuit::Priorisation, '#f97316'],
            [4, NiveauGraviteCode::Critique, 'Critique', EffetCircuit::Accelere, '#dc2626'],
        ];

        foreach ($niveaux as [$niveau, $code, $libelle, $effet, $couleur]) {
            NiveauGravite::query()->updateOrCreate(
                ['niveau' => $niveau],
                [
                    'code' => $code->value,
                    'libelle' => $libelle,
                    'effet_circuit' => $effet->value,
                    'couleur' => $couleur,
                    'actif' => true,
                ]
            );
        }
    }
}
