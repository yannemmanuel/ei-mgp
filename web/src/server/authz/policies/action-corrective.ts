import { aPermission, type UtilisateurAutorise } from "../utilisateur";
import { peutVoirDossier, type DossierPourAutorisation } from "./dossier";

/** Port de `App\Policies\ActionCorrectivePolicy`. */
export type ActionCorrectivePourAutorisation = DossierPourAutorisation;

export function peutVoirListeActions(u: UtilisateurAutorise): boolean {
  return aPermission(u, "actions.view");
}

export function peutVoirAction(
  u: UtilisateurAutorise,
  a: ActionCorrectivePourAutorisation,
): boolean {
  return aPermission(u, "actions.view") && peutVoirDossier(u, a);
}

export function peutCreerAction(
  u: UtilisateurAutorise,
  a: ActionCorrectivePourAutorisation,
): boolean {
  return aPermission(u, "actions.create") && peutVoirDossier(u, a);
}

export function peutModifierAction(
  u: UtilisateurAutorise,
  a: ActionCorrectivePourAutorisation,
): boolean {
  return aPermission(u, "actions.update") && peutVoirDossier(u, a);
}

export function peutVerifierEfficacite(
  u: UtilisateurAutorise,
  a: ActionCorrectivePourAutorisation,
): boolean {
  return aPermission(u, "actions.verify_efficacite") && peutVoirDossier(u, a);
}

export function peutCloturerAction(
  u: UtilisateurAutorise,
  a: ActionCorrectivePourAutorisation,
): boolean {
  return aPermission(u, "actions.close") && peutVoirDossier(u, a);
}
