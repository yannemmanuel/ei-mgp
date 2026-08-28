<?php

namespace App\Console\Commands;

use App\Models\Dossier;
use App\Models\User;
use App\Services\Notification\NotificationService;
use App\Services\Workflow\DelaiService;
use Illuminate\Console\Command;

/**
 * EX-NOT-04 : escalade à échéance dépassée. Deux paliers additifs, revérifiés à chaque exécution
 * (alerte répétée tant que le retard persiste — cf. docs/decisions-techniques.md DT-28, aucune
 * table de déduplication demandée par le CDC) :
 *   - dépassement > 0 % : N+1 du/des responsable(s) actuel(s) + Service MGP.
 *   - dépassement >= 50 % : Direction Générale, en plus du palier précédent.
 */
class DetecterRetards extends Command
{
    private const SEUIL_DIRECTION_POURCENT = 50.0;

    protected $signature = 'dossiers:detecter-retards';

    protected $description = 'Détecte les dossiers en retard et alerte N+1 / Service MGP / Direction selon le palier (EX-NOT-04).';

    public function handle(DelaiService $delais, NotificationService $notifications): int
    {
        $dossiers = Dossier::query()
            ->whereHas('statut', fn ($q) => $q->where('is_terminal', false))
            ->with(['statut', 'parcours', 'affectationsActives.utilisateur.responsableHierarchique'])
            ->get();

        $compteur = 0;

        foreach ($dossiers as $dossier) {
            if (! $delais->estEnRetard($dossier)) {
                continue;
            }

            $responsables = $dossier->affectationsActives->pluck('utilisateur')->filter();

            $n1 = $responsables->map(fn (User $u) => $u->responsableHierarchique)->filter()->unique('id');

            if ($n1->isNotEmpty()) {
                $notifications->envoyer('alerte_retard_n1', $dossier, $n1);
            }

            $serviceMgp = User::query()->role('service_mgp')->where('actif', true)->get();

            if ($serviceMgp->isNotEmpty()) {
                $notifications->envoyer('alerte_retard_service_mgp', $dossier, $serviceMgp);
            }

            if ($delais->estEnRetardDe($dossier, self::SEUIL_DIRECTION_POURCENT)) {
                $direction = User::query()->role('dg')->where('actif', true)->get();

                if ($direction->isNotEmpty()) {
                    $notifications->envoyer('alerte_retard_direction', $dossier, $direction);
                }
            }

            $compteur++;
        }

        $this->info("{$compteur} dossier(s) en retard détecté(s).");

        return self::SUCCESS;
    }
}
