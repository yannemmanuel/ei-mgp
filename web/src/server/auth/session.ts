import { redirect } from 'next/navigation'
import type { Permission } from '@/server/authz'
import {
  aPermission,
  aUnePermissionParmi,
  chargerUtilisateurAutorise,
  type UtilisateurAutorise,
} from '@/server/authz'
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
 * ce qui est le comportement attendu pour un visiteur non
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

/** Redirige vers /login si aucun utilisateur actif n'est authentifié. */
export async function exigerUtilisateur(): Promise<UtilisateurAutorise> {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur) {
    redirect('/login')
  }

  return utilisateur
}

/**
 * Redirige vers /acces-refuse si la permission n'est pas détenue.
 *
 * Pourquoi une redirection plutôt qu'une exception rendue par `error.tsx` : en production,
 * Next.js retire le `name` et le `message` des erreurs serveur avant de les transmettre au
 * client (pour éviter les fuites d'information). Une frontière d'erreur ne peut donc PAS
 * distinguer un refus d'autorisation d'une panne technique — elle afficherait « une erreur est
 * survenue » au lieu de « accès refusé », uniquement en production.
 *
 * ⚠️ REDIRECTION PLUTÔT QUE 403, et c'est délibéré : l'utilisateur est redirigé
 * vers une page de refus explicite. L'accès est bloqué de la même façon ; seule la présentation
 * diffère.
 */
export async function exigerPermission(permission: Permission): Promise<UtilisateurAutorise> {
  const utilisateur = await exigerUtilisateur()

  if (!aPermission(utilisateur, permission)) {
    /**
     * Le droit manquant voyage avec la redirection.
     *
     * Sans lui, la page de refus ne pouvait dire ni ce qui manque ni à qui le demander — on
     * restait bloqué sans savoir quoi faire. Ce n'est pas la fuite que redoute
     * `exigences-securite.md` §5 : celle-là concerne l'EXISTENCE d'un dossier, et un dossier hors
     * périmètre répond `notFound()`, jamais ce chemin. Ici, la personne est authentifiée, elle
     * sait déjà qu'on lui refuse la page ; lui nommer la capacité requise ne révèle aucune
     * donnée. La page valide le paramètre contre le catalogue fermé avant d'en afficher quoi que
     * ce soit.
     */
    redirect(`/acces-refuse?droit=${encodeURIComponent(permission)}`)
  }

  return utilisateur
}

/**
 * Même garde, pour une page qui s'ouvre à QUI DÉTIENT AU MOINS UN droit d'une famille.
 *
 * Le sommaire de l'administration est le cas : il regroupe dix consoles dont chacune a sa propre
 * permission, et n'en exige aucune en particulier. Faute de cette variante, il n'exigeait
 * RIEN — la barre latérale masquait bien le lien à qui n'y avait pas droit, mais l'adresse
 * tapée à la main répondait 200 à n'importe quel compte connecté. Masquer un lien n'est pas un
 * contrôle d'accès ; c'est écrit en tête de `navigation.ts`, et il manquait le contrôle.
 *
 * Le droit nommé dans la redirection est le PREMIER de la liste : celui qui ouvre la page dans
 * le cas le plus courant. Les énumérer tous ne dirait pas mieux ce qu'il faut demander.
 */
export async function exigerUnePermissionParmi(
  permissions: readonly Permission[]
): Promise<UtilisateurAutorise> {
  const utilisateur = await exigerUtilisateur()

  if (!aUnePermissionParmi(utilisateur, permissions)) {
    redirect(`/acces-refuse?droit=${encodeURIComponent(permissions[0])}`)
  }

  return utilisateur
}
