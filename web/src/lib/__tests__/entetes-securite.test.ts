import { describe, expect, it } from 'vitest'
import { entetesSecurite } from '../entetes-securite'

/**
 * ⚠️ LE DÉFAUT QUE CE FICHIER PROTÈGE : l'application ne renvoyait AUCUN en-tête de sécurité.
 *
 * Constat le plus élevé de l'audit du 2026-09-22. Elle était encadrable en iframe — donc exposée
 * au détournement de clic, un écran d'administration superposé à une page tierce suffisant à
 * faire cliquer « Supprimer » à quelqu'un qui croit cliquer ailleurs — et sans aucune défense en
 * profondeur le jour où une injection apparaîtrait.
 *
 * Ces cas tiennent les deux moitiés : ce qui doit être FERMÉ, et ce qui doit rester OUVERT. La
 * seconde compte autant : une politique qui casse l'aperçu des pièces jointes serait retirée
 * sous huit jours, et l'application repartirait sans protection du tout.
 */
const valeur = (production: boolean, cle: string) =>
  entetesSecurite(production).find((e) => e.key === cle)?.value

const csp = (production = true) => valeur(production, 'Content-Security-Policy') ?? ''

/** Les directives, découpées comme un navigateur les lit. */
const directive = (nom: string, production = true): string | undefined =>
  csp(production)
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === nom || d.startsWith(`${nom} `))

describe('⚠️ Ce que les en-têtes FERMENT', () => {
  it('⚠️ interdit l’encadrement en iframe — le défaut d’origine', () => {
    // Deux fois plutôt qu'une : la directive moderne, et l'en-tête hérité pour les navigateurs
    // qui l'ignorent. Retirer l'un des deux rouvre la porte sur une partie du parc.
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(valeur(true, 'X-Frame-Options')).toBe('DENY')
  })

  it('⚠️ empêche l’exfiltration vers un domaine tiers', () => {
    /*
      La protection la plus utile de la liste. Même si du script hostile s'exécutait — la CSP
      admet l'inline, voir le commentaire du module —, il n'aurait nulle part où envoyer ce
      qu'il lit.
    */
    expect(directive('connect-src')).toBe("connect-src 'self'")
    expect(directive('default-src')).toBe("default-src 'self'")
  })

  it('n’autorise aucun script EXTERNE', () => {
    const scripts = directive('script-src') ?? ''

    expect(scripts, 'un domaine externe est admis pour les scripts').not.toMatch(/https?:/)
    expect(scripts).toContain("'self'")
  })

  it('ferme les greffons, la réécriture de base et la soumission externe', () => {
    // `object-src 'none'` retire un vecteur d'injection ancien mais toujours actif ;
    // `base-uri` empêche de détourner toutes les URL relatives de la page ;
    // `form-action` empêche qu'un formulaire poste les identifiants ailleurs.
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
    expect(directive('form-action')).toBe("form-action 'self'")
  })

  it('ne laisse pas deviner un type MIME, ni fuir le chemin d’un dossier', () => {
    expect(valeur(true, 'X-Content-Type-Options')).toBe('nosniff')

    /*
      Une URL de dossier porte son identifiant. Laisser fuir le chemin complet vers un site tiers
      révélerait l'existence et la référence d'un signalement à quiconque reçoit la visite.
    */
    expect(valeur(true, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('refuse caméra, micro et géolocalisation', () => {
    const politique = valeur(true, 'Permissions-Policy') ?? ''

    for (const surface of ['camera=()', 'microphone=()', 'geolocation=()']) {
      expect(politique, `${surface} n’est pas refusée`).toContain(surface)
    }
  })
})

describe('⚠️ Ce que les en-têtes doivent laisser OUVERT', () => {
  it('⚠️ laisse l’aperçu des pièces jointes s’afficher', () => {
    /*
      `panneau-pieces-jointes.tsx` rend une iframe vers `/api/pieces-jointes/[id]`.
      `frame-src 'none'` — le réflexe quand on durcit une CSP — casserait l'aperçu SANS message :
      le cadre reste blanc, et rien dans l'interface ne dit pourquoi.

      ⚠️ À ne pas confondre avec `frame-ancestors`, qui dit qui peut nous encadrer. Celui-ci dit
      ce que NOUS pouvons encadrer.
    */
    expect(directive('frame-src')).toBe("frame-src 'self'")
  })

  it('laisse les aperçus d’image et la compression fonctionner', () => {
    // La compression côté client produit des `blob:`, les aperçus passent par `data:`.
    const images = directive('img-src') ?? ''

    expect(images).toContain('data:')
    expect(images).toContain('blob:')
  })

  it('laisse Next.js s’hydrater', () => {
    /*
      ⚠️ CONCESSION ASSUMÉE, et le cas existe pour qu'elle reste délibérée. Next sérialise l'état
      d'hydratation dans des `<script>` en ligne ; les interdire rend l'application entièrement
      blanche. La fermer demande des `nonce` par requête — un chantier à part.

      Le jour où ce sera fait, ce cas échouera, et c'est le bon moment pour le mettre à jour.
    */
    expect(directive('script-src')).toContain("'unsafe-inline'")
    expect(directive('style-src')).toContain("'unsafe-inline'")
  })

  it('⚠️ laisse React appeler eval() EN DÉVELOPPEMENT', () => {
    /*
      ⚠️ LE DÉFAUT QUE CE CAS A PRIS, une fois la politique déjà en service.

      React en mode développement appelle `eval()` pour ses outils de mise au point. Sans
      `'unsafe-eval'`, le navigateur refuse l'appel et l'écran se remplit d'erreurs :
      « eval() is not supported in this environment ».

      La politique avait été vérifiée sur une construction de PRODUCTION (`next start`), jamais en
      `next dev` — alors que les en-têtes s'appliquent aux deux. La vérification portait sur le
      seul mode où le défaut ne pouvait pas apparaître.
    */
    expect(
      directive('script-src', false),
      'React ne pourra pas appeler eval() : le mode développement sera inutilisable'
    ).toContain("'unsafe-eval'")
  })

  it('⚠️ ne laisse JAMAIS eval() partir en production', () => {
    /*
      La contrepartie, et elle est impérative. React le dit lui-même : « React will never use
      eval() in production mode ». L'y laisser rouvrirait le vecteur d'injection le plus direct
      qui soit, pour un besoin qui n'existe pas.
    */
    expect(
      directive('script-src', true),
      'unsafe-eval part en production : le vecteur d’injection le plus direct est rouvert'
    ).not.toContain("'unsafe-eval'")

    expect(csp(true), 'unsafe-eval apparaît ailleurs dans la politique').not.toContain(
      "'unsafe-eval'"
    )
  })
})

describe('⚠️ HSTS ne doit JAMAIS sortir en développement', () => {
  it('est absent hors production', () => {
    /*
      ⚠️ LE PIÈGE QUE CE CAS FERME. `Strict-Transport-Security` demande au navigateur de n'accéder
      au domaine qu'en HTTPS, et il le RETIENT. Émis depuis localhost, il épingle localhost en
      HTTPS dans le navigateur du développeur — pour toute la durée du `max-age`, et pour TOUS les
      projets qui tournent sur ce port. Le poste devient inutilisable pour le développement web,
      et la cause est introuvable.
    */
    expect(
      valeur(false, 'Strict-Transport-Security'),
      'HSTS est émis en développement : il épinglera localhost en HTTPS'
    ).toBeUndefined()
  })

  it('est présent en production, sans promettre le préchargement', () => {
    const hsts = valeur(true, 'Strict-Transport-Security') ?? ''

    expect(hsts).toContain('max-age=63072000')
    expect(hsts).toContain('includeSubDomains')

    // `preload` annoncerait une soumission à la liste de préchargement qui n'a pas eu lieu.
    expect(hsts, 'le préchargement est annoncé sans avoir été demandé').not.toContain('preload')
  })

  it('⚠️ ne réécrit pas les ressources en HTTPS hors production', () => {
    /*
      `upgrade-insecure-requests` demande au navigateur de réécrire en HTTPS toute sous-ressource
      demandée en HTTP. En local, l'application tourne sur `http://localhost` : si l'exemption des
      origines « potentiellement sûres » ne s'appliquait pas, TOUTES les ressources seraient
      réécrites vers un HTTPS qui n'écoute pas — panne totale, sans message.

      Elle n'apporte rien en local et sa protection en production est marginale. Elle reste donc
      cantonnée là où elle ne peut rien casser.
    */
    expect(csp(false), 'la directive part en développement').not.toContain(
      'upgrade-insecure-requests'
    )
    expect(csp(true)).toContain('upgrade-insecure-requests')
  })

  it('ne change rien d’AUTRE entre développement et production', () => {
    // Une politique qui diffère largement selon l'environnement ne se teste plus : ce qu'on
    // vérifie en local cesse de dire ce qui part en production. Les deux seules différences sont
    // nommées ci-dessus, et elles le sont parce qu'elles sont dangereuses en local.
    const sansCspNiHsts = (production: boolean) =>
      entetesSecurite(production).filter(
        (e) => e.key !== 'Strict-Transport-Security' && e.key !== 'Content-Security-Policy'
      )

    expect(sansCspNiHsts(false)).toEqual(sansCspNiHsts(true))

    /*
      Et la CSP ne diffère que par les deux directives nommées : `upgrade-insecure-requests`, qui
      n'apparaît qu'en production, et `'unsafe-eval'`, qui n'apparaît qu'en développement. Toute
      autre divergence ferait que ce qu'on vérifie en local cesse de dire ce qui part en
      production.
    */
    expect(
      csp(true).replace('; upgrade-insecure-requests', ''),
      'la politique diverge ailleurs que sur les deux directives prévues'
    ).toBe(csp(false).replace(" 'unsafe-eval'", ''))
  })
})
