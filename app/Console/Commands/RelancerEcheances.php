<?php

namespace App\Console\Commands;

use App\Models\Dossier;
use App\Services\Notification\NotificationService;
use App\Services\Workflow\DelaiService;
use Illuminate\Console\Command;

/**
 * EX-NOT-03 : relance automatique des acteurs de traitement 3 jours (J-3) avant l'échéance de
 * l'étape courante d'un dossier. Déclenchée uniquement le jour exact où joursRestants() vaut 3
 * (pas à chaque jour de J-3 à J-0), pour n'envoyer qu'une seule relance par étape.
 */
class RelancerEcheances extends Command
{
    private const SEUIL_JOURS = 3;

    protected $signature = 'dossiers:relancer-echeances';

    protected $description = "Relance les acteurs de traitement 3 jours avant l'échéance de l'étape courante (EX-NOT-03).";

    public function handle(DelaiService $delais, NotificationService $notifications): int
    {
        $dossiers = Dossier::query()
            ->whereHas('statut', fn ($q) => $q->where('is_terminal', false))
            ->with(['statut', 'parcours', 'affectationsActives.utilisateur'])
            ->get();

        $compteur = 0;

        foreach ($dossiers as $dossier) {
            if ($delais->joursRestants($dossier) !== self::SEUIL_JOURS) {
                continue;
            }

            $responsables = $dossier->affectationsActives->pluck('utilisateur')->filter();

            if ($responsables->isEmpty()) {
                continue;
            }

            $notifications->envoyer('relance_echeance', $dossier, $responsables, [
                'jours_restants' => (string) self::SEUIL_JOURS,
            ]);

            $compteur++;
        }

        $this->info("{$compteur} dossier(s) relancé(s) (J-3).");

        return self::SUCCESS;
    }
}
