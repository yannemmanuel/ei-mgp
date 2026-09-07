import { prisma } from '@/lib/prisma'

/**
 * Limitation de débit — équivalent de `RateLimiter` (Laravel).
 *
 * **Le compteur vit en base**, dans la table `cache`, et non en mémoire de processus. C'est ce
 * qui rend la limite effective sur un déploiement multi-instances : un compteur local se
 * contourne en frappant une autre instance, ce qui annule toute la protection contre
 * l'énumération d'un code d'accès à 6 chiffres (docs/exigences-securite.md §4).
 *
 * L'incrément est fait par un **unique ordre SQL** avec `ON CONFLICT` : deux requêtes simultanées
 * ne peuvent pas lire la même valeur et écrire le même compte. Un `SELECT` suivi d'un `UPDATE`
 * laisserait précisément la fenêtre qu'un attaquant cherche.
 *
 * ⚠️ Le format n'est PAS celui du `RateLimiter` de Laravel (qui sérialise en PHP et préfixe ses
 * clés) : les deux applications tiennent donc des compteurs distincts pendant la cohabitation.
 * L'objectif ici est le partage entre instances Next, pas l'interopérabilité.
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

/** Préfixe distinctif : la table `cache` est partagée avec Laravel. */
const PREFIXE = 'next:debit:'

/**
 * Les DEUX parties sont normalisées.
 *
 * Les appels existants n'ont pas tous le même ordre : `cleThrottle(email, ip)` à la connexion,
 * `cleThrottle('suivi-ref', reference)` au suivi. Ne normaliser qu'une position laisserait
 * l'autre exploitable — une simple variation de casse de l'e-mail suffirait à repartir de zéro.
 */
export function cleThrottle(portee: string, valeur: string): string {
  const normaliser = (v: string) => v.trim().toLowerCase()

  return `${PREFIXE}${normaliser(portee)}|${normaliser(valeur)}`
}

/**
 * `true` si la tentative est autorisée — et la comptabilise.
 *
 * @param maintenant Injectable pour les tests ; jamais fourni par un appelant réel.
 */
export async function autoriserTentative(
  cle: string,
  maintenant: number = Date.now(),
  limite: LimiteDebit = LIMITE_CONNEXION
): Promise<boolean> {
  const secondes = Math.floor(maintenant / 1000)
  const expiration = secondes + Math.ceil(limite.fenetreMs / 1000)

  // Un seul ordre : incrémente si la fenêtre court encore, repart à 1 si elle est close.
  const lignes = await prisma.$queryRaw<{ tentatives: number }[]>`
    INSERT INTO cache (key, value, expiration)
    VALUES (${cle}, '1', ${expiration})
    ON CONFLICT (key) DO UPDATE SET
      value = CASE
        WHEN cache.expiration <= ${secondes} THEN '1'
        ELSE (cache.value::int + 1)::text
      END,
      expiration = CASE
        WHEN cache.expiration <= ${secondes} THEN ${expiration}
        ELSE cache.expiration
      END
    RETURNING value::int AS tentatives
  `

  return (lignes[0]?.tentatives ?? 1) <= limite.maxTentatives
}

/** Remet le compteur à zéro après une opération réussie (comportement de Laravel). */
export async function reinitialiserTentatives(cle: string): Promise<void> {
  await prisma.cache.deleteMany({ where: { key: cle } })
}

/**
 * Purge les compteurs expirés.
 *
 * Les lignes expirées ne faussent aucun calcul — l'ordre d'incrément les traite comme absentes —
 * mais elles s'accumuleraient indéfiniment. Appelée par les tâches planifiées.
 */
export async function purgerDebits(maintenant: number = Date.now()): Promise<number> {
  const resultat = await prisma.cache.deleteMany({
    where: { key: { startsWith: PREFIXE }, expiration: { lte: Math.floor(maintenant / 1000) } },
  })

  return resultat.count
}

/** Réservé aux tests : retire tous les compteurs de débit. */
export async function viderThrottle(): Promise<void> {
  await prisma.cache.deleteMany({ where: { key: { startsWith: PREFIXE } } })
}
