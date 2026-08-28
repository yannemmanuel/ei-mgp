<?php

namespace App\Console\Commands;

use App\Services\Rgpd\PolitiqueConservationService;
use Illuminate\Console\Command;

/** RG-11 : applique la politique de conservation (archivage à 24 mois, anonymisation à 10 ans après clôture, sauf contentieux). */
class AppliquerPolitiqueConservation extends Command
{
    protected $signature = 'dossiers:appliquer-politique-conservation';

    protected $description = 'Archive et anonymise les dossiers clôturés selon la politique de conservation RG-11.';

    public function handle(PolitiqueConservationService $service): int
    {
        $archives = $service->archiver();
        $anonymises = $service->anonymiser();
        $exclus = $service->compterExclusPourContentieux();

        $this->info("{$archives} dossier(s) archivé(s), {$anonymises} anonymisé(s), {$exclus} exclu(s) pour contentieux actif.");

        return self::SUCCESS;
    }
}
