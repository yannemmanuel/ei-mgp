<?php

namespace Database\Seeders;

use App\Models\Site;
use Illuminate\Database\Seeder;

/**
 * Cf. DirectionSeeder : données illustratives reprises des exemples du CDC (§9.2, §9.4),
 * à remplacer par la liste réelle des sites via la console d'administration.
 */
class SiteSeeder extends Seeder
{
    public function run(): void
    {
        $sites = [
            'SITE-YOP' => 'Site de Yopougon',
            'SITE-SIEGE' => 'Siège',
            'SITE-KOKOTI' => 'Zone de Kokoti',
        ];

        foreach ($sites as $code => $libelle) {
            Site::query()->updateOrCreate(['code' => $code], ['libelle' => $libelle, 'actif' => true]);
        }
    }
}
