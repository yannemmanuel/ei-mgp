import { aPermission, type UtilisateurAutorise } from "../utilisateur";
import { peutVoirDossier, type DossierPourAutorisation } from "./dossier";

/**
 * Port de `App\Policies\MessagePolicy` — côté ACTEUR AUTHENTIFIÉ uniquement.
 *
 * L'accès du déclarant (y compris anonyme) à la messagerie de son propre dossier ne passe
 * JAMAIS par ce module : il s'authentifie par référence + code de suivi, pas par un compte
 * utilisateur (RG-06). Ce chemin sera traité séparément à l'étape 9.
 */
export type MessagePourAutorisation = DossierPourAutorisation;

export function peutVoirMessagerie(
  u: UtilisateurAutorise,
  m: MessagePourAutorisation,
): boolean {
  return aPermission(u, "messagerie.view") && peutVoirDossier(u, m);
}

export function peutEnvoyerMessage(
  u: UtilisateurAutorise,
  m: MessagePourAutorisation,
): boolean {
  return aPermission(u, "messagerie.send") && peutVoirDossier(u, m);
}
