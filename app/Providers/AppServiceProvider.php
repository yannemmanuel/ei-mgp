<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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
    }
}
