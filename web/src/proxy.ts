import { NextResponse, type NextRequest } from 'next/server'

/**
 * `proxy.ts` remplace `middleware.ts`, déprécié en Next.js 16.
 *
 * ⚠️ CE FICHIER N'EST PAS UN CONTRÔLE D'ACCÈS. Il ne fait qu'éviter d'afficher une page
 * protégée à un visiteur manifestement non connecté (absence de cookie de session). La
 * documentation Next.js précise que le proxy peut être déployé en périphérie (CDN) et ne doit
 * pas dépendre de modules partagés : aucune requête base n'y est faite, et la présence d'un
 * cookie ne prouve rien.
 *
 * L'autorisation réelle — identité, activité du compte, rôles, permissions, cloisonnement par
 * parcours — est TOUJOURS refaite côté serveur dans chaque page et chaque Server Action, via
 * `exigerUtilisateur()` / `exigerPermission()` (`src/server/auth/session.ts`).
 */
const ROUTES_PUBLIQUES = [
  '/login',
  /*
    Lien de première connexion : la personne n'a PAS encore de mot de passe.

    Elle ne peut donc pas être connectée — la renvoyer vers `/login` la renverrait vers l'écran
    même qu'elle n'a aucun moyen de franchir, et le lien reçu par courriel n'aurait servi à rien.
    L'authentification, ici, c'est le jeton : à usage unique, expirant, vérifié côté serveur par
    `verifierInvitation()` avant que la page ne montre quoi que ce soit.
  */
  '/premiere-connexion',
  '/declarer',
  '/suivi',
  '/q', // redirection QR code
  // Déclencheur des tâches planifiées : appelé par un cron EXTERNE, qui n'a évidemment pas de
  // cookie de session. Il n'est pas « public » pour autant — il porte sa propre authentification,
  // plus stricte que celle-ci : secret partagé de 32 caractères comparé à temps constant, POST
  // exigé, et refus par défaut si le secret n'est pas configuré.
  '/api/taches',
]

function estPublique(chemin: string): boolean {
  return ROUTES_PUBLIQUES.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (estPublique(pathname)) {
    return NextResponse.next()
  }

  // Auth.js nomme son cookie `authjs.session-token`, préfixé `__Secure-` en HTTPS.
  const aCookieSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token')

  if (!aCookieSession) {
    const url = new URL('/login', request.url)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Exclut les ressources internes de Next.js, l'API d'authentification et les fichiers statiques.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
