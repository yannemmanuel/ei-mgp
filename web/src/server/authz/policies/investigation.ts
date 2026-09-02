import type { ParcoursCode } from '../parcours'
import { peutVoirParcours } from '../parcours'
import { aPermission, type UtilisateurAutorise } from '../utilisateur'

/** Port de `App\Policies\InvestigationPolicy`. */
export type InvestigationPourAutorisation = {
  readonly parcoursCode: ParcoursCode
  readonly enqueteurId: bigint
}

export function peutVoirListeInvestigations(u: UtilisateurAutorise): boolean {
  return aPermission(u, 'investigations.view')
}

export function peutVoirInvestigation(u: UtilisateurAutorise, i: InvestigationPourAutorisation): boolean {
  return aPermission(u, 'investigations.view') && peutVoirParcours(u.roles, i.parcoursCode)
}

export function peutCreerInvestigation(u: UtilisateurAutorise, i: InvestigationPourAutorisation): boolean {
  return aPermission(u, 'investigations.create') && peutVoirParcours(u.roles, i.parcoursCode)
}

export function peutModifierInvestigation(u: UtilisateurAutorise, i: InvestigationPourAutorisation): boolean {
  return aPermission(u, 'investigations.update') && peutVoirParcours(u.roles, i.parcoursCode)
}

/** RGI-06 : la validation ne peut JAMAIS être effectuée par l'enquêteur lui-même. */
export function peutValiderInvestigation(u: UtilisateurAutorise, i: InvestigationPourAutorisation): boolean {
  return (
    aPermission(u, 'investigations.validate') &&
    i.enqueteurId !== u.id &&
    peutVoirParcours(u.roles, i.parcoursCode)
  )
}
