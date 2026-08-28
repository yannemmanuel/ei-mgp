<?php

namespace App\Providers;

use App\Policies\ExportPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Formulaires publics de déclaration : surface d'abus la plus large de l'application,
        // sans authentification (docs/exigences-securite.md §4).
        RateLimiter::for('declaration', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // EX-REP-06 : App\Policies\ExportPolicy n'est adossée à aucun modèle Eloquent (l'export
        // n'est pas l'action sur UNE ressource mais une capacité générale) — la résolution
        // automatique de Policy par convention (App\Models\X -> App\Policies\XPolicy) ne
        // s'applique donc pas ; enregistrement explicite requis.
        Gate::define('export-rapports', [ExportPolicy::class, 'export']);
        Gate::define('export-rapports-nominatif', [ExportPolicy::class, 'exportNominatif']);
    }
}
