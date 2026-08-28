<?php

namespace App\Console\Commands;

use App\Services\ActionCorrective\ActionCorrectiveService;
use Illuminate\Console\Command;

/**
 * EX-ACT-03 : « job de recalcul du retard ». Bascule en "en_retard" toute action corrective non
 * réalisée dont l'échéance est dépassée. Ne fait jamais l'inverse (une action "en_retard" reprise
 * repasse par une transition manuelle "en_cours", cf. ActionCorrectiveService) : ce job ne fait que
 * détecter un dépassement, jamais annuler la décision d'un acteur.
 */
class RecalculerRetardActionsCorrectives extends Command
{
    protected $signature = 'ei-mgp:recalculer-retard-actions-correctives';

    protected $description = 'Marque "en retard" les actions correctives non réalisées dont l\'échéance est dépassée (EX-ACT-03).';

    public function handle(ActionCorrectiveService $service): int
    {
        $nombre = $service->recalculerRetards();

        $this->info("{$nombre} action(s) corrective(s) marquée(s) en retard.");

        return self::SUCCESS;
    }
}
