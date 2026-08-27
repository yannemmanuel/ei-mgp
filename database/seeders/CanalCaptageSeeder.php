<?php

namespace Database\Seeders;

use App\Enums\CanalCaptageCode;
use App\Models\CanalCaptage;
use Illuminate\Database\Seeder;

class CanalCaptageSeeder extends Seeder
{
    public function run(): void
    {
        $canaux = [
            ['code' => CanalCaptageCode::QrCode, 'libelle' => 'QR code'],
            ['code' => CanalCaptageCode::LigneVerte, 'libelle' => 'Ligne verte'],
            ['code' => CanalCaptageCode::BoiteSuggestions, 'libelle' => 'Boîte à suggestions'],
            ['code' => CanalCaptageCode::AgentLocal, 'libelle' => 'Agent local'],
        ];

        foreach ($canaux as $c) {
            CanalCaptage::query()->updateOrCreate(
                ['code' => $c['code']->value],
                ['libelle' => $c['libelle'], 'actif' => true]
            );
        }
    }
}
