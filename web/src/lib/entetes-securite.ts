/**
 * En-têtes de sécurité HTTP de l'application (audit du 2026-09-22 : il n'y en avait aucun).
 *
 * Posés dans `next.config.ts` et non dans `netlify.toml` : ils suivent alors l'application — en
 * développement, en test et chez n'importe quel hébergeur — au lieu de disparaître au premier
 * changement de cible.
 */

export type EnteteHttp = { readonly key: string; readonly value: string }

/**
 * Politique de sécurité du contenu.
 *
 * Ce qui doit rester ouvert, et pourquoi :
 *
 * - `frame-src 'self'` — l'aperçu des pièces jointes est une iframe vers `/api/pieces-jointes`.
 *   `'none'` le casserait sans message.
 * - `img-src data: blob:` — la compression d'image côté client produit des `blob:`.
 * - `style-src 'unsafe-inline'` — Next injecte ses styles critiques en ligne.
 *
 * `frame-ancestors 'none'` ferme le détournement de clic, `connect-src 'self'` l'exfiltration.
 * Aucune ressource externe n'est chargée : `next/font/google` auto-héberge les polices.
 */
const DIRECTIVES_CSP: readonly string[] = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]

/**
 * `'unsafe-inline'` est une concession : Next sérialise l'état d'hydratation dans des `<script>`
 * en ligne, et les interdire rend l'application blanche. Le fermer demande des `nonce` par
 * requête, donc un rendu dynamique de chaque page. Aucun script EXTERNE ne reste chargeable.
 *
 * ⚠️ `'unsafe-eval'` en développement seulement : React l'utilise pour ses outils de mise au
 * point, et sans lui l'écran se remplit d'erreurs `eval() is not supported`. React n'y recourt
 * jamais en production, où le laisser rouvrirait le vecteur d'injection le plus direct.
 */
const SCRIPT_SRC = {
  developpement: "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  production: "script-src 'self' 'unsafe-inline'",
} as const

/**
 * Réservé à la production : l'application tourne en `http://localhost` en développement, et
 * l'exemption des origines « potentiellement sûres » n'a pas été vérifiée dans un navigateur. La
 * panne qu'elle produirait serait totale et sans message.
 */
const DIRECTIVE_PRODUCTION = 'upgrade-insecure-requests'

/**
 * ⚠️ Production uniquement. Émis depuis `localhost`, HSTS épingle localhost en HTTPS dans le
 * navigateur du développeur — pour tous les projets sur ce port, et la cause est introuvable.
 *
 * `preload` n'est pas déclaré : l'annoncer sans avoir soumis le domaine promet ce qui n'existe pas.
 */
const HSTS = 'max-age=63072000; includeSubDomains'

/**
 * Les en-têtes appliqués à toutes les réponses.
 *
 * @param production Vrai en production seulement — commande le seul en-tête dangereux en local.
 */
export function entetesSecurite(production: boolean): EnteteHttp[] {
  // `script-src` en deuxième position dans les deux cas, pour que la politique se relise pareil.
  const directives = production
    ? [DIRECTIVES_CSP[0], SCRIPT_SRC.production, ...DIRECTIVES_CSP.slice(1), DIRECTIVE_PRODUCTION]
    : [DIRECTIVES_CSP[0], SCRIPT_SRC.developpement, ...DIRECTIVES_CSP.slice(1)]

  const entetes: EnteteHttp[] = [
    { key: 'Content-Security-Policy', value: directives.join('; ') },

    // Doublon volontaire de `frame-ancestors`, pour les navigateurs qui ignorent la directive.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },

    // Une URL de dossier porte sa référence : le chemin complet ne doit pas fuir vers un tiers.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

    // Aucune fonctionnalité matérielle n'est utilisée, y compris sur le formulaire public.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },

    { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ]

  if (production) {
    entetes.push({ key: 'Strict-Transport-Security', value: HSTS })
  }

  return entetes
}
