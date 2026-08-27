<?php

namespace App\Providers;

use App\Actions\Fortify\ResetUserPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Fortify\Fortify;

/**
 * Périmètre volontairement réduit : pas d'inscription publique (EX-DEC-04/05, les comptes sont
 * créés par l'administration), pas de 2FA/passkeys (non exigées par le CDC — cf. config/fortify.php
 * et docs/decisions-techniques.md). Seuls login/logout et la réinitialisation de mot de passe
 * sont actifs.
 */
class FortifyServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);

        Fortify::loginView(fn () => view('auth.login'));

        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())).'|'.$request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });
    }
}
