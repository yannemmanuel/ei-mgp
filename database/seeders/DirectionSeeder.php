<?php

namespace Database\Seeders;

use App\Models\Direction;
use Illuminate\Database\Seeder;

/**
 * Référentiel organisationnel non fourni de façon exhaustive par le CDC : les libellés
 * ci-dessous reprennent uniquement les exemples cités dans les formulaires (§9.1, §9.2) pour
 * amorcer la démonstration. À compléter/remplacer par la structure réelle de l'organisation
 * via la console d'administration (Module 14) avant mise en production.
 */
class DirectionSeeder extends Seeder
{
    public function run(): void
    {
        $directions = [
            'DIR-OPS' => 'Direction des Opérations',
            'DIR-RH' => 'Direction des Ressources Humaines',
            'DIR-QHSE' => 'Direction QHSE',
        ];

        foreach ($directions as $code => $libelle) {
            Direction::query()->updateOrCreate(['code' => $code], ['libelle' => $libelle, 'actif' => true]);
        }
    }
}
