<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * docs/exigences-securite.md §5 : durcissement standard OWASP par en-têtes de réponse — aucune
 * de ces valeurs n'est spécifique à une règle métier du CDC, seulement des contrôles techniques
 * de référence appliqués à toute réponse HTTP de l'application.
 */
class SetSecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        return $response;
    }
}
