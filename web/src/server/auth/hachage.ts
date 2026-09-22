import bcrypt from 'bcryptjs'

/**
 * Hachage bcrypt commun aux mots de passe et aux codes d'accès.
 *
 * ⚠️ **LE PRÉFIXE COMPTE, ET IL DOIT RESTER `$2y$`.** `bcryptjs` écrit `$2b$` ; les hachages
 * DÉJÀ EN BASE, eux, portent tous `$2y$` — ils ont été produits par le dispositif précédent, en
 * PHP, qui n'émettait que cette forme.
 *
 * L'algorithme et le coût sont identiques : seul l'en-tête de format diffère, pour des raisons
 * historiques, et `bcryptjs` relit les deux sans difficulté. La normalisation en `$2y$` ne sert
 * donc plus l'interopérabilité — elle sert l'HOMOGÉNÉITÉ : un même champ ne doit pas porter deux
 * formats selon la date de création de la ligne. Un contrôle écrit un jour sur le préfixe (une
 * migration, un audit, une détection de hachage faible) verrait sinon deux populations là où il
 * n'y en a qu'une.
 *
 * Vérifié dans les deux sens, pas supposé : `__tests__/hachage.test.ts` relit un `$2y$` produit
 * ailleurs et vérifie que ce module en émet un.
 */

/**
 * Coût bcrypt : 12 en production, abaissé en test par `BCRYPT_ROUNDS`.
 *
 * ⚠️ Le coût est INSCRIT DANS LE HACHAGE : l'augmenter n'invalide pas les empreintes existantes,
 * qui restent vérifiables à leur propre coût. Le baisser en production, en revanche, affaiblit
 * tout ce qui sera écrit ensuite, sans rien signaler.
 */
export const COUT_BCRYPT = Number(process.env.BCRYPT_ROUNDS ?? 12)

const PREFIXE_BCRYPTJS = /^\$2[abx]\$/

export async function hacher(valeur: string): Promise<string> {
  const hache = await bcrypt.hash(valeur, COUT_BCRYPT)

  return hache.replace(PREFIXE_BCRYPTJS, '$2y$')
}

export function verifier(valeur: string, hache: string): Promise<boolean> {
  return bcrypt.compare(valeur, hache)
}
