<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Spatie\Permission\Middleware\PermissionMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // docs/exigences-securite.md §2 : middleware permission: (spatie) sur toutes les routes
        // back-office d'administration (Phase 10) — celles-ci n'ont pas de cloisonnement par
        // parcours (contrairement aux dossiers/investigations/actions, qui restent gérés par
        // Policy), un simple contrôle de permission suffit donc à leur niveau.
        $middleware->alias([
            'permission' => PermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
