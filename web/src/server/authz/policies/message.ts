import type { ParcoursCode } from '../parcours'
import { peutVoirParcours } from '../parcours'
import { aPermission, type UtilisateurAutorise } from '../utilisateur'

/**
 * Port de `App\Policies\MessagePolicy` — côté ACTEUR AUTHENTIFIÉ uniquement.
 *
 * L'accès du déclarant (y compris anonyme) à la messagerie de son propre dossier ne passe
 * JAMAIS par ce module : il s'authentifie par référence + code de suivi, pas par un compte
 * utilisateur (RG-06). Ce chemin sera traité séparément à l'étape 9.
 */
export type MessagePourAutorisation = {
  readonly parcoursCode: ParcoursCode
}

export function peutVoirMessagerie(u: UtilisateurAutorise, m: MessagePourAutorisation): boolean {
  return aPermission(u, 'messagerie.view') && peutVoirParcours(u.roles, m.parcoursCode)
}

export function peutEnvoyerMessage(u: UtilisateurAutorise, m: MessagePourAutorisation): boolean {
  return aPermission(u, 'messagerie.send') && peutVoirParcours(u.roles, m.parcoursCode)
}
