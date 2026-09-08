import type { StatutCode } from '@/server/services/dossier/statuts'
import { peutFaireAvancerDepuis } from '../etapes'
import type { ParcoursCode } from '../parcours'
import { peutVoirParcours } from '../parcours'
import { siteCloisonnant } from '../site'
import { aPermission, aRole, aUnePermissionParmi, type UtilisateurAutorise } from '../utilisateur'

/**
 * Autorisation d'accès aux dossiers (docs/acteurs.md, RG-14).
 *
 * Toute vérification d'accès à un dossier passe par ce module : aucune page, aucune Server
 * Action ne doit réimplémenter cette logique. Les fonctions sont pures — l'appelant fournit les
 * seuls champs nécessaires — pour rester testables sans base de données.
 */
export type DossierPourAutorisation = {
  readonly parcoursCode: ParcoursCode
  readonly statutCode: StatutCode
  readonly isAnonymous: boolean
  readonly declarantUserId: bigint | null
  /** Site du dossier, déduit de la direction concernée. `null` si la direction n'en a aucun. */
  readonly siteId: bigint | null
  /**
   * L'utilisateur détient-il une affectation ACTIVE sur ce dossier ?
   *
   * Nécessaire à `dossiers.view.own` : sans cette information, la permission ne peut pas se
   * distinguer de `dossiers.view`. L'appelant la calcule — le module reste pur.
   */
  readonly estAffecteAuLecteur: boolean
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

  /**
   * Cloisonnement par site, en plus du parcours.
   *
   * Un dossier SANS site n'est vu d'aucun rôle cloisonné : la direction concernée n'est rattachée
   * à aucun site, personne ne peut donc dire de qui il relève. Le rendre visible à tous par
   * défaut annulerait le cloisonnement au premier référentiel incomplet.
   */
  const site = siteCloisonnant(u)
  if (site !== null && dossier.siteId !== site) {
    return false
  }

  if (aPermission(u, 'dossiers.view')) {
    return peutVoirParcours(u.roles, dossier.parcoursCode)
  }

  /**
   * `dossiers.view.own` : SES dossiers, pas tout son parcours.
   *
   * La permission était traitée à l'identique de `dossiers.view`, ce qui la vidait de son sens —
   * les rôles de captage (`rgp`, `captage_grief_communaute`, `captage_grief_soustraitant`)
   * voyaient l'intégralité des dossiers de leur parcours quand `docs/acteurs.md` §2 leur accorde
   * « écriture captage, lecture de ses dossiers ». Le défaut venait de la baseline Laravel
   * (`DossierPolicy::view`) et avait été porté fidèlement.
   *
   * « Ses dossiers » = ceux qui lui sont affectés — l'affectation automatique (EX-GES-02) leur
   * confie précisément les déclarations qu'ils captent — ou ceux qu'il a lui-même déclarés.
   */
  if (aPermission(u, 'dossiers.view.own')) {
    if (!peutVoirParcours(u.roles, dossier.parcoursCode)) return false

    return dossier.estAffecteAuLecteur || dossier.declarantUserId === u.id
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

/**
 * Faire avancer un dossier : la permission ne suffit pas, l'étape désigne ses acteurs.
 *
 * `docs/workflows.md` §3 attribue chaque étape à un ensemble de rôles. Sans ce troisième
 * contrôle, un même compte pouvait pousser seul un dossier de « Reçu » à « Résolu », sur
 * n'importe quel parcours de son périmètre, en franchissant des marches confiées à d'autres.
 */
export function peutChangerStatutDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return (
    aPermission(u, 'dossiers.status.update') &&
    peutVoirDossier(u, dossier) &&
    peutFaireAvancerDepuis(u.roles, dossier.parcoursCode, dossier.statutCode)
  )
}

export function peutCloturerDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.close') && peutVoirDossier(u, dossier)
}

/** RG-07 : réservé à Service MGP/DADD et DG, via la permission `dossiers.reopen`. */
export function peutReouvrirDossier(u: UtilisateurAutorise, dossier: DossierPourAutorisation): boolean {
  return aPermission(u, 'dossiers.reopen') && peutVoirDossier(u, dossier)
}
