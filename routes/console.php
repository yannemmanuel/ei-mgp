<?php

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
