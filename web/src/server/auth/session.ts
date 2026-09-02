import { redirect } from 'next/navigation'
import type { Permission } from '@/server/authz'
import { aPermission, chargerUtilisateurAutorise, type UtilisateurAutorise } from '@/server/authz'
import { auth } from './config'

/**
 * Pont entre la session Auth.js et la couche d'autorisation.
 *
 * Toute page et toute Server Action doit passer par `exigerUtilisateur()` ou
 * `exigerPermission()`. Le proxy (`src/proxy.ts`) ne fait qu'une redirection de confort et ne
 * constitue JAMAIS un contrôle d'accès : il ne consulte pas la base.
 *
 * Les primitives `unauthorized()`/`forbidden()` de Next.js sont volontairement écartées : elles
 * restent expérimentales en 16 (drapeau `experimental.authInterrupts`), et la couche de sécurité
 * ne doit pas dépendre d'une API susceptible de changer. On s'en tient à `redirect()`, stable —
 * ce qui reproduit d'ailleurs exactement le comportement Laravel pour un visiteur non
 * authentifié (cf. `tests/Feature/Auth/LoginTest.php`).
 */

/** Levée quand un utilisateur authentifié ne détient pas le droit requis (équivalent d'un 403). */
export class ErreurAutorisation extends Error {
  constructor(public readonly permission?: Permission) {
    super(
      permission
        ? `Autorisation refusée : permission « ${permission} » requise.`
        : 'Autorisation refusée.'
    )
    this.name = 'ErreurAutorisation'
  }
}

export async function utilisateurCourant(): Promise<UtilisateurAutorise | null> {
  const session = await auth()
  const id = session?.user?.id

  if (!id) {
    return null
  }

  const utilisateur = await chargerUtilisateurAutorise(BigInt(id))

  // Le compte a pu être supprimé ou désactivé depuis l'émission du jeton : les droits étant
  // relus en base à chaque appel, la révocation est immédiate.
  if (!utilisateur?.actif) {
    return null
  }

  return utilisateur
}

/** Redirige vers /login si aucun utilisateur actif n'est authentifié (comportement Laravel). */
export async function exigerUtilisateur(): Promise<UtilisateurAutorise> {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur) {
    redirect('/login')
  }

  return utilisateur
}

/** Lève `ErreurAutorisation` si la permission n'est pas détenue (équivalent du 403 Laravel). */
export async function exigerPermission(permission: Permission): Promise<UtilisateurAutorise> {
  const utilisateur = await exigerUtilisateur()

  if (!aPermission(utilisateur, permission)) {
    throw new ErreurAutorisation(permission)
  }

  return utilisateur
}
