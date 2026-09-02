import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

/**
 * Vérification des identifiants contre les comptes Laravel existants.
 *
 * Les mots de passe sont des hachages bcrypt `$2y$12$` produits par Laravel : `bcryptjs` les
 * accepte tels quels, aucune réinitialisation n'est nécessaire lors de la bascule.
 */
export type ResultatVerification =
  | { statut: 'ok'; userId: bigint }
  | { statut: 'identifiants_invalides' }
  | { statut: 'compte_desactive' }

/**
 * Divergence délibérée avec la baseline Laravel (cf. MIGRATION_PLAN.md, étape 2) : Laravel
 * n'applique AUCUN contrôle sur `users.actif` à la connexion — un compte désactivé peut s'y
 * connecter et conserve tous ses droits. Le portage refuse ce compte.
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
