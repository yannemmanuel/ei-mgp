<?php

use App\Console\Commands\AppliquerPolitiqueConservation;
use App\Console\Commands\CalculerStatistiquesMensuelles;
use App\Console\Commands\DetecterRetards;
use App\Console\Commands\RecalculerRetardActionsCorrectives;
use App\Console\Commands\RelancerEcheances;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// EX-ACT-03 : recalcul quotidien du retard des actions correctives. Cadence non spécifiée par le
// CDC — quotidien retenu par cohérence avec la granularité "jour" des échéances (colonne `date`,
// pas `datetime`), documenté dans docs/decisions-techniques.md.
Schedule::command(RecalculerRetardActionsCorrectives::class)->daily();

// EX-NOT-03/04 : relances J-3 et détection des retards (escalade N+1/Service MGP/Direction).
// Cadence quotidienne par cohérence avec la granularité "jour" des délais (docs/decisions-
// techniques.md DT-28).
Schedule::command(RelancerEcheances::class)->daily();
Schedule::command(DetecterRetards::class)->daily();

// EX-REP-05 : statistiques mensuelles archivées le 1er de chaque mois pour le mois précédent
// (le mois courant n'est jamais complet le jour de son propre calcul).
Schedule::command(CalculerStatistiquesMensuelles::class)->monthlyOn(1, '01:30');

// RG-11 : politique de conservation (archivage 24 mois, anonymisation 10 ans après clôture, sauf
// contentieux). Cadence mensuelle : les seuils se comptent en mois/années, une vérification
// quotidienne n'apporterait aucune réactivité utile.
Schedule::command(AppliquerPolitiqueConservation::class)->monthlyOn(1, '02:00');
