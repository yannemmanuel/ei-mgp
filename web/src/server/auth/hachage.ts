import bcrypt from 'bcryptjs'

/**
 * Hachage bcrypt commun aux mots de passe et aux codes d'accès.
 *
 * ⚠️ **Le préfixe compte.** `bcryptjs` écrit `$2b$` ; PHP n'accepte que `$2y$`. Laravel vérifie
 * les deux (`Hash::check`) avec `verifyAlgorithm` actif, et lève
 * `RuntimeException: This password does not use the Bcrypt algorithm.` sur un `$2b$` — le
 * hachage est alors définitivement illisible côté Laravel.
 *
 * L'algorithme et le coût sont pourtant identiques : seul l'en-tête de format diffère, pour des
 * raisons historiques. Il est donc réécrit en `$2y$`, ce que `bcryptjs` relit sans difficulté
 * (c'est déjà ainsi que la connexion vérifie les mots de passe produits par Laravel).
 *
 * Vérifié dans les deux sens contre le PHP du projet, pas supposé : tant que les deux
 * applications cohabitent, un compte ou un code émis d'un côté doit rester utilisable de l'autre.
 */

/** Coût bcrypt, aligné sur le `BCRYPT_ROUNDS` de Laravel (12 en production, 4 en test). */
export const COUT_BCRYPT = Number(process.env.BCRYPT_ROUNDS ?? 12)

const PREFIXE_BCRYPTJS = /^\$2[abx]\$/

export async function hacher(valeur: string): Promise<string> {
  const hache = await bcrypt.hash(valeur, COUT_BCRYPT)

  return hache.replace(PREFIXE_BCRYPTJS, '$2y$')
}

export function verifier(valeur: string, hache: string): Promise<boolean> {
  return bcrypt.compare(valeur, hache)
}
