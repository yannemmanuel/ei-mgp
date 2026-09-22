import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hacher } from './hachage'

/**
 * Vérification des identifiants.
 *
 * ⚠️ LES MOTS DE PASSE EXISTANTS SONT DES `$2y$12$`, produits par le dispositif précédent en PHP.
 * `bcryptjs` les accepte tels quels : personne n'a eu à réinitialiser son mot de passe à la
 * bascule, et personne ne devrait avoir à le faire. Voir `auth/hachage.ts` pour le préfixe.
 */
export type ResultatVerification =
  | { statut: 'ok'; userId: bigint }
  | { statut: 'identifiants_invalides' }
  | { statut: 'compte_desactive' }

/**
 * ⚠️ UN COMPTE DÉSACTIVÉ NE SE CONNECTE PAS, et c'est un durcissement délibéré : le dispositif
 * précédent n'appliquait aucun contrôle sur `users.actif` à la connexion — un compte désactivé
 * pouvait s'y connecter et conservait tous ses droits. Ce contrôle a été ajouté à la bascule, et
 * ne doit pas être relâché en le prenant pour une divergence accidentelle.
 */
export async function verifierIdentifiants(
  email: string,
  motDePasse: string
): Promise<ResultatVerification> {
  const utilisateur = await prisma.users.findFirst({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, password: true, actif: true },
  })

  // `users.password` est nullable (préparation SSO, DT-01) : un compte sans mot de passe ne peut
  // pas se connecter par identifiants.
  if (!utilisateur?.password) {
    // Comparaison factice pour que le temps de réponse ne révèle pas l'existence du compte.
    await bcrypt.compare(motDePasse, '$2a$12$' + 'x'.repeat(53))
    return { statut: 'identifiants_invalides' }
  }

  if (!(await bcrypt.compare(motDePasse, utilisateur.password))) {
    return { statut: 'identifiants_invalides' }
  }

  if (!utilisateur.actif) {
    return { statut: 'compte_desactive' }
  }

  return { statut: 'ok', userId: utilisateur.id }
}

/**
 * Hachage d'un mot de passe, pour les comptes créés depuis la console d'administration.
 *
 * Passe par `@/server/auth/hachage`, qui normalise le préfixe en `$2y$` : sans cela, Laravel
 * refuserait le compte à la connexion (cf. le docblock de ce module).
 */
export function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hacher(motDePasse)
}
