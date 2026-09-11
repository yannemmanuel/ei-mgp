import type { ParcoursCode } from '../parcours'
import { peutVoirParcours } from '../parcours'
import { aPermission, type UtilisateurAutorise } from '../utilisateur'

/** Port de `App\Policies\ActionCorrectivePolicy`. */
export type ActionCorrectivePourAutorisation = {
  readonly parcoursCode: ParcoursCode
}

export function peutVoirListeActions(u: UtilisateurAutorise): boolean {
  return aPermission(u, 'actions.view')
}

export function peutVoirAction(u: UtilisateurAutorise, a: ActionCorrectivePourAutorisation): boolean {
  return aPermission(u, 'actions.view') && peutVoirParcours(u, a.parcoursCode)
}

export function peutCreerAction(u: UtilisateurAutorise, a: ActionCorrectivePourAutorisation): boolean {
  return aPermission(u, 'actions.create') && peutVoirParcours(u, a.parcoursCode)
}

export function peutModifierAction(u: UtilisateurAutorise, a: ActionCorrectivePourAutorisation): boolean {
  return aPermission(u, 'actions.update') && peutVoirParcours(u, a.parcoursCode)
}

export function peutVerifierEfficacite(u: UtilisateurAutorise, a: ActionCorrectivePourAutorisation): boolean {
  return aPermission(u, 'actions.verify_efficacite') && peutVoirParcours(u, a.parcoursCode)
}

export function peutCloturerAction(u: UtilisateurAutorise, a: ActionCorrectivePourAutorisation): boolean {
  return aPermission(u, 'actions.close') && peutVoirParcours(u, a.parcoursCode)
}
