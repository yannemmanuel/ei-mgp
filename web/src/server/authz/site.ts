import type { Permission } from './permissions'
import { aPermission } from './utilisateur'

/**
 * Cloisonnement par rattachement — site ou direction.
 *
 * Un compte porte un site OU une direction, jamais les deux. La direction est la granularité la
 * plus fine et l'emporte ; le site couvre toutes les directions qui lui sont rattachées. Le site
 * d'un dossier n'est pas saisi : il découle de la direction concernée.
 *
 * Ce cloisonnement s'ajoute à celui par parcours, il ne le remplace pas.
 *
 * Quels rôles sont cloisonnés ne s'écrit plus ici : cela se coche rôle par rôle dans les
 * habilitations et se lit sur le compte (`cloisonneParRattachement`).
 */

/** Droits qui font d'un rôle un porteur d'accès aux dossiers. */
const ACCES_AUX_DOSSIERS = ['dossiers.view', 'dossiers.view.all', 'dossiers.view.own'] as const

/** Lu dans les permissions du rôle, jamais dans son nom. */
export function donneAccesAuxDossiers(permissions: Iterable<string>): boolean {
  const portees = new Set(permissions)

  return ACCES_AUX_DOSSIERS.some((droit) => portees.has(droit))
}

/**
 * Ce compte est-il borné à son rattachement, d'après les rôles qu'il porte ?
 *
 * ⚠️ TOUS ses rôles porteurs doivent le prévoir, pas un seul. Cumuler deux rôles, c'est porter un
 * mandat plus large : restreindre alors masquerait des dossiers que le second rôle donne le droit
 * de voir.
 *
 * Un compte sans rôle porteur n'est pas borné — il n'a rien à voir de toute façon.
 */
export function cloisonnePourSesRoles(
  roles: readonly { readonly cloisonne: boolean; readonly donneAcces: boolean }[]
): boolean {
  const porteurs = roles.filter((role) => role.donneAcces)

  return porteurs.length > 0 && porteurs.every((role) => role.cloisonne)
}

/**
 * Le strict nécessaire pour décider du cloisonnement.
 *
 * Volontairement plus étroit que `UtilisateurAutorise` : deux services construisent cette
 * photographie à la main, et exiger le type complet les obligerait à inventer des valeurs pour
 * des champs qui ne les concernent pas. Un `UtilisateurAutorise` complet reste accepté.
 */
export type PourCloisonnement = {
  readonly siteId: bigint | null
  readonly directionId: bigint | null
  readonly permissions: ReadonlySet<Permission>
  readonly cloisonneParRattachement: boolean
}

/** Un accès transverse (`dossiers.view.all`) n'est jamais cloisonné. */
function estSoumisAuRattachement(u: PourCloisonnement): boolean {
  if (aPermission(u, 'dossiers.view.all')) return false

  return u.cloisonneParRattachement
}

/**
 * Direction à laquelle ce compte est borné, ou `null`.
 *
 * ⚠️ Conséquence assumée : un dossier SANS direction — tous les griefs communautaires et
 * sous-traitants — n'est vu d'aucun compte ainsi borné.
 *
 * Si les deux colonnes sont renseignées (anciennes lignes), la direction l'emporte : pour un
 * cloisonnement, la bonne erreur est de restreindre.
 */
export function directionCloisonnante(u: PourCloisonnement): bigint | null {
  if (u.directionId === null) return null
  if (!estSoumisAuRattachement(u)) return null

  return u.directionId
}

/**
 * Site auquel ce compte est borné, ou `null`.
 *
 * ⚠️ Rend `null` dès qu'une direction borne le compte : appliquer les deux refuserait des dossiers
 * légitimes, une direction pouvant n'être rattachée à aucun site.
 *
 * Un compte sans aucun rattachement n'est pas restreint : traiter l'oubli de paramétrage comme un
 * refus donnerait un écran vide sans explication.
 */
export function siteCloisonnant(u: PourCloisonnement): bigint | null {
  if (directionCloisonnante(u) !== null) return null
  if (u.siteId === null) return null
  if (!estSoumisAuRattachement(u)) return null

  return u.siteId
}

/**
 * Ce compte répond-il de ce dossier, au titre de son rattachement ?
 *
 * Prédicat unique pour les trois endroits qui posaient la question séparément — qui voit le
 * dossier, qui le reçoit à la création, qui en a la charge. Deux s'étaient déjà trompés.
 *
 * Ne dit rien du parcours ni des permissions : `peutVoirDossier()` reste seul juge de l'accès.
 */
export function rattachementCouvre(
  u: PourCloisonnement,
  dossier: { readonly siteId: bigint | null; readonly directionId: bigint | null }
): boolean {
  const direction = directionCloisonnante(u)
  if (direction !== null) return dossier.directionId === direction

  const site = siteCloisonnant(u)
  return site === null || dossier.siteId === site
}

/**
 * Ce compte devrait-il porter un rattachement sans en avoir aucun ?
 *
 * Alerte de la console des comptes : un secrétaire sans rattachement voit tous les dossiers de son
 * parcours. Une direction suffit à le borner — alerter dans ce cas serait une fausse alerte.
 */
export function siteManquant(
  cloisonneParRattachement: boolean,
  siteId: bigint | null,
  directionId: bigint | null = null
): boolean {
  return siteId === null && directionId === null && cloisonneParRattachement
}
