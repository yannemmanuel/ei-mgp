/**
 * Limitation de débit des tentatives de connexion — équivalent de
 * `RateLimiter::for('login')` (Laravel, `FortifyServiceProvider`) : 5 tentatives par minute,
 * par couple e-mail + adresse IP.
 *
 * ⚠️ Implémentation EN MÉMOIRE, donc valable pour un seul processus. Elle est suffisante en
 * développement et sur un déploiement mono-instance, mais devra passer par un magasin partagé
 * (Redis, ou la table `cache` déjà présente) avant une mise en production multi-instances,
 * sinon la limite est contournable en frappant une autre instance. Consigné dans
 * MIGRATION_PLAN.md.
 */
const FENETRE_MS = 60_000
const MAX_TENTATIVES = 5

type Compteur = { tentatives: number; expireA: number }

const compteurs = new Map<string, Compteur>()

function purger(maintenant: number): void {
  for (const [cle, compteur] of compteurs) {
    if (compteur.expireA <= maintenant) {
      compteurs.delete(cle)
    }
  }
}

export function cleThrottle(email: string, ip: string): string {
  // Laravel applique Str::lower + transliteration ; la casse est la seule part qui compte ici
  // pour éviter qu'une variation de casse ne réinitialise le compteur.
  return `${email.trim().toLowerCase()}|${ip}`
}

/** `true` si la tentative est autorisée (et la comptabilise), `false` si le seuil est atteint. */
export function autoriserTentative(cle: string, maintenant: number = Date.now()): boolean {
  purger(maintenant)

  const compteur = compteurs.get(cle)

  if (!compteur || compteur.expireA <= maintenant) {
    compteurs.set(cle, { tentatives: 1, expireA: maintenant + FENETRE_MS })
    return true
  }

  if (compteur.tentatives >= MAX_TENTATIVES) {
    return false
  }

  compteur.tentatives += 1
  return true
}

/** Remet le compteur à zéro après une connexion réussie (comportement de Laravel). */
export function reinitialiserTentatives(cle: string): void {
  compteurs.delete(cle)
}

/** Réservé aux tests : vide entièrement l'état. */
export function viderThrottle(): void {
  compteurs.clear()
}
