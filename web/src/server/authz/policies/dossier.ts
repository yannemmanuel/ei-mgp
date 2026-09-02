import type { ParcoursCode } from '../parcours'
import { peutVoirParcours } from '../parcours'
import { aPermission, aRole, aUnePermissionParmi, type UtilisateurAutorise } from '../utilisateur'

/**
 * Port de `App\Policies\DossierPolicy` (docs/acteurs.md, RG-14).
 *
 * Toute vérification d'accès à un dossier passe par ce module : aucune page, aucune Server
 * Action ne doit réimplémenter cette logique. Les fonctions sont pures — l'appelant fournit les
 * seuls champs nécessaires — pour rester testables sans base de données.
 */
export type DossierPourAutorisation = {
  readonly parcoursCode: ParcoursCode
  readonly isAnonymous: boolean
  readonly declarantUserId: bigint | null
}

export function peutVoirListeDossiers(u: UtilisateurAutorise): boolean {
  return aUnePermissionParmi(u, ['dossiers.view', 'dossiers.view.all', 'dossiers.view.own'])
}

export function peutVoirDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  // Un employé déclarant ne voit QUE ses propres dossiers non anonymes : un dossier anonyme
  // n'est jamais rattaché à son auteur, même si celui-ci était connecté (RG-06).
  if (aRole(u, 'employe_declarant')) {
    return !dossier.isAnonymous && dossier.declarantUserId === u.id
  }

  if (aPermission(u, 'dossiers.view.all')) {
    return true
  }

  if (aUnePermissionParmi(u, ['dossiers.view', 'dossiers.view.own'])) {
    return peutVoirParcours(u.roles, dossier.parcoursCode)
  }

  return false
}

export function peutCreerDossier(u: UtilisateurAutorise): boolean {
  return aPermission(u, 'dossiers.create')
}

export function peutAffecterDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.assign') && peutVoirDossier(u, dossier)
}

export function peutReaffecterDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.reassign') && peutVoirDossier(u, dossier)
}

export function peutChangerStatutDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.status.update') && peutVoirDossier(u, dossier)
}

export function peutCloturerDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.close') && peutVoirDossier(u, dossier)
}

/** RG-07 : réservé à Service MGP/DADD et DG, via la permission `dossiers.reopen`. */
export function peutReouvrirDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.reopen') && peutVoirDossier(u, dossier)
}
