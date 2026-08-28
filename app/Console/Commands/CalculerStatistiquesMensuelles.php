<?php

namespace App\Console\Commands;

use App\Services\Reporting\StatistiqueMensuelleService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * EX-REP-05 : calcule et archive les statistiques agrégées du mois. Planifiée pour le mois
 * précédent (le mois courant n'est jamais complet) ; --mois permet un calcul ponctuel/rattrapage.
 */
class CalculerStatistiquesMensuelles extends Command
{
    protected $signature = 'rapports:calculer-statistiques-mensuelles {--mois= : Mois à calculer (YYYY-MM), défaut : le mois précédent}';

    protected $description = 'Calcule et archive les statistiques mensuelles agrégées et anonymisées (EX-REP-05).';

    public function handle(StatistiqueMensuelleService $service): int
    {
        $mois = $this->option('mois')
            ? CarbonImmutable::createFromFormat('Y-m', (string) $this->option('mois'))
            : CarbonImmutable::now()->subMonthNoOverflow();

        $creees = $service->calculerPour($mois);

        $this->info("{$creees} ligne(s) de statistiques créée(s) pour {$mois->format('Y-m')}.");

        return self::SUCCESS;
    }
}
