/**
 * En-têtes de sécurité HTTP de l'application.
 *
 * ⚠️ IL N'Y EN AVAIT AUCUN, et c'est le constat le plus élevé de l'audit du 2026-09-22.
 *
 * L'application ne renvoyait ni `Content-Security-Policy`, ni `X-Frame-Options`, ni
 * `Strict-Transport-Security`. Conséquence immédiate : elle était ENCADRABLE EN IFRAME, donc
 * exposée au détournement de clic — un écran d'administration superposé à une page tierce suffit
 * à faire cliquer « Supprimer » à quelqu'un qui croit cliquer ailleurs. Et il n'existait aucune
 * défense en profondeur le jour où une faille d'injection apparaîtrait.
 *
 * Le raisonnement avait pourtant été tenu pour les PIÈCES JOINTES servies
 * (`stockage/reponse-piece-jointe.ts` pose `nosniff` et une CSP d'isolation). Il manquait pour
 * l'application elle-même.
 *
 * ⚠️ POSÉ DANS `next.config.ts`, ET NON DANS `netlify.toml`. Les en-têtes suivent alors
 * l'application : ils s'appliquent en développement, en test et chez n'importe quel hébergeur.
 * Confiés au fichier de l'hébergeur, ils disparaîtraient au premier changement de cible, sans que
 * rien ne le signale — et le développement continuerait de tourner sans eux, donc sans jamais
 * révéler ce qu'ils cassent.
 */

export type EnteteHttp = { readonly key: string; readonly value: string }

/**
 * La politique de sécurité du contenu.
 *
 * ⚠️ CE QUE CHAQUE DIRECTIVE FERME, ET CE QU'ELLE DOIT LAISSER PASSER — vérifié sur le code,
 * pas supposé :
 *
 * - `frame-ancestors 'none'` ferme le détournement de clic. C'est la directive qui motive tout le
 *   reste ; elle remplace `X-Frame-Options`, conservé pour les navigateurs anciens.
 * - `frame-src 'self'` doit rester OUVERT sur l'origine : l'aperçu des pièces jointes est une
 *   iframe vers `/api/pieces-jointes/[id]` (`panneau-pieces-jointes.tsx`). `'none'` casserait
 *   l'aperçu sans message.
 * - `connect-src 'self'` empêche l'exfiltration vers un domaine tiers. C'est la protection la
 *   plus utile de la liste : même si du script hostile s'exécutait, il n'aurait nulle part où
 *   envoyer ce qu'il lit.
 * - `img-src` admet `data:` et `blob:` — la compression d'image côté client produit des `blob:`,
 *   et les aperçus passent par `data:`.
 * - `style-src` admet `'unsafe-inline'` : Next injecte ses styles critiques en ligne, et les
 *   niveaux de gravité sont rendus par style en ligne depuis une couleur du référentiel.
 * - Aucune ressource externe n'est chargée : les polices viennent de `next/font/google`, qui les
 *   AUTO-HÉBERGE à la construction. Vérifié — pas un seul `https://` dans le code rendu.
 *
 * ⚠️ `script-src` ADMET `'unsafe-inline'`, ET C'EST UNE CONCESSION ASSUMÉE. Next.js sérialise
 * l'état d'hydratation dans des balises `<script>` en ligne ; les interdire rend l'application
 * entièrement blanche. La fermer pour de bon demande des `nonce` par requête, donc un passage par
 * le proxy et un rendu dynamique de chaque page — un chantier à part, qui n'a pas sa place dans
 * la correction d'un défaut ouvert. Ce qui est fermé ici l'est vraiment : aucun script EXTERNE ne
 * peut être chargé, et rien ne peut sortir de l'origine.
 */
const DIRECTIVES_CSP: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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
 * ⚠️ `upgrade-insecure-requests` EST RÉSERVÉ À LA PRODUCTION, et l'écarter en local n'est pas de
 * la superstition.
 *
 * La directive demande au navigateur de réécrire en HTTPS toute sous-ressource demandée en HTTP.
 * En production, où tout est déjà servi en HTTPS, elle ne coûte rien et rattrape une éventuelle
 * URL écrite en dur. En développement, l'application tourne sur `http://localhost` : la
 * spécification exempte les origines « potentiellement sûres », dont localhost — mais je n'ai pas
 * pu le VÉRIFIER dans un navigateur ici, et la panne qu'elle produirait si l'exemption ne
 * s'appliquait pas est totale et sans message (toutes les ressources réécrites vers un HTTPS qui
 * n'écoute pas).
 *
 * Une directive dont le comportement local n'est pas vérifié, et qui n'apporte rien en local, ne
 * part pas en local.
 */
const DIRECTIVE_PRODUCTION = 'upgrade-insecure-requests'

/**
 * ⚠️ HSTS UNIQUEMENT EN PRODUCTION, et ce n'est pas une précaution de style.
 *
 * `Strict-Transport-Security` demande au navigateur de n'accéder au domaine qu'en HTTPS, et il
 * le RETIENT. Émis depuis `localhost`, il épingle localhost en HTTPS dans le navigateur du
 * développeur — pour toute la durée du `max-age`, sur TOUS les projets qui tournent sur ce port.
 * Le poste devient inutilisable pour le développement web, et la cause est introuvable.
 *
 * Deux ans avec les sous-domaines : la valeur attendue pour une éventuelle soumission à la liste
 * de préchargement. `preload` n'est PAS déclaré — l'annoncer sans avoir soumis le domaine promet
 * quelque chose qui n'existe pas.
 */
const HSTS = 'max-age=63072000; includeSubDomains'

/**
 * Les en-têtes appliqués à toutes les réponses de l'application.
 *
 * @param production Vrai en production seulement — commande le seul en-tête dangereux en local.
 */
export function entetesSecurite(production: boolean): EnteteHttp[] {
  const directives = production ? [...DIRECTIVES_CSP, DIRECTIVE_PRODUCTION] : DIRECTIVES_CSP

  const entetes: EnteteHttp[] = [
    { key: 'Content-Security-Policy', value: directives.join('; ') },

    // Doublon volontaire de `frame-ancestors`, pour les navigateurs qui ignorent la directive.
    { key: 'X-Frame-Options', value: 'DENY' },

    // Empêche le navigateur de deviner un type MIME et d'exécuter comme script ce qui est servi
    // comme texte. Déjà posé sur les pièces jointes ; il manquait partout ailleurs.
    { key: 'X-Content-Type-Options', value: 'nosniff' },

    /*
      L'origine complète vers nos propres pages, la seule origine vers l'extérieur.

      Une URL de dossier porte son identifiant : `/dossiers/01m2td…`. Laisser fuir le chemin
      complet vers un site tiers révélerait l'existence et la référence d'un signalement à
      quiconque reçoit la visite.
    */
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

    /*
      Aucune fonctionnalité matérielle n'est utilisée — vérifié : ni caméra, ni micro, ni
      géolocalisation, y compris sur le formulaire public. Les refuser explicitement retire ces
      surfaces à tout script qui s'exécuterait malgré la CSP.
    */
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },

    // Les noms d'hôte visités ne partent pas en résolution anticipée vers des tiers.
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ]

  if (production) {
    entetes.push({ key: 'Strict-Transport-Security', value: HSTS })
  }

  return entetes
}
