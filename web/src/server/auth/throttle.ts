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
export type LimiteDebit = { readonly fenetreMs: number; readonly maxTentatives: number }

/** `RateLimiter::for('login')` : 5 tentatives par minute. */
const LIMITE_CONNEXION: LimiteDebit = { fenetreMs: 60_000, maxTentatives: 5 }

/**
 * Envoi de message par le canal PUBLIC (`MessagerieDossier`, branche non authentifiée) :
 * 10 messages par tranche de 10 minutes. Un acteur interne authentifié n'y est pas soumis —
 * seul le canal ouvert est exposé au flood (docs/exigences-securite.md §4, même principe que
 * DT-14 sur la déclaration).
 */
export const LIMITE_MESSAGERIE: LimiteDebit = { fenetreMs: 600_000, maxTentatives: 10 }

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
export function autoriserTentative(
  cle: string,
  maintenant: number = Date.now(),
  limite: LimiteDebit = LIMITE_CONNEXION
): boolean {
  purger(maintenant)

  const compteur = compteurs.get(cle)

  if (!compteur || compteur.expireA <= maintenant) {
    compteurs.set(cle, { tentatives: 1, expireA: maintenant + limite.fenetreMs })
    return true
  }

  if (compteur.tentatives >= limite.maxTentatives) {
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
