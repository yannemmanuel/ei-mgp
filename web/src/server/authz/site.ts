import type { Role } from './roles'
import { aPermission, type UtilisateurAutorise } from './utilisateur'

/**
 * Cloisonnement par site.
 *
 * « Un secrétaire est habilité par site, et sur un site on peut avoir une ou plusieurs
 * directions. » Le site d'un dossier n'est pas saisi : il découle de la direction concernée
 * (`directions.site_id`), elle-même choisie à la déclaration.
 *
 * Ce cloisonnement s'AJOUTE à celui par parcours, il ne le remplace pas : un secrétaire CSST reste
 * borné aux dossiers `ei_employe`, et parmi eux à ceux de son site.
 */
const ROLES_CLOISONNES_PAR_SITE = [
  'secretaire_csst',
  'rqse',
  'rgp',
  'captage_grief_communaute',
  'captage_grief_soustraitant',
  // Le chargé de sécurité est celui DU SITE : il voit tous les évènements indésirables du sien,
  // et aucun de ceux d'ailleurs. C'est ce qui remplace l'affectation, supprimée pour ce parcours.
  'charge_securite',
  // « Responsable MGP de structure → griefs de sa structure » : la structure est le site, seul
  // découpage que porte chaque dossier, y compris ceux des sous-traitants et des riverains — qui
  // n'ont, eux, aucune direction.
  'responsable_mgp_structure',
] as const satisfies readonly Role[]

export function estCloisonneParSite(role: Role): boolean {
  return (ROLES_CLOISONNES_PAR_SITE as readonly string[]).includes(role)
}

/**
 * Site auquel cet utilisateur est borné, ou `null` s'il ne l'est pas.
 *
 * Trois raisons de ne pas l'être, et chacune compte :
 *
 * 1. **Aucun site sur le compte.** Le rattachement n'est pas renseigné : on ne restreint pas. Le
 *    contraire — « pas de site, donc rien » — transformerait un oubli de paramétrage en écran
 *    vide sans explication, sur des comptes qui travaillaient la veille. La console des comptes
 *    signale ces cas plutôt que de les faire échouer en silence.
 * 2. **Un accès transverse.** `dossiers.view.all` est accordé aux rôles que le CDC veut sur les
 *    quatre parcours : le site ne les concerne pas.
 * 3. **Un rôle non cloisonné en plus.** Cumuler « Secrétaire CSST » et « Correspondant MGP », ce
 *    n'est pas être deux fois restreint, c'est porter un mandat plus large. Restreindre alors par
 *    site retirerait des dossiers que le second rôle donne le droit de voir — et masquer est la
 *    direction dangereuse de l'erreur.
 */
export function siteCloisonnant(u: UtilisateurAutorise): bigint | null {
  if (u.siteId === null) return null
  if (aPermission(u, 'dossiers.view.all')) return null

  // `agent_relais` ne donne accès à aucun dossier : il ne desserre donc rien.
  const rolesPortant = u.roles.filter((role) => role !== 'agent_relais')

  if (rolesPortant.length === 0) return null
  if (!rolesPortant.every(estCloisonneParSite)) return null

  return u.siteId
}

/**
 * Un compte devrait-il porter un site sans en avoir un ?
 *
 * Sert à alerter dans la console des comptes : un secrétaire sans site voit tous les dossiers de
 * son parcours, ce qui est exactement ce que le cloisonnement doit empêcher.
 */
export function siteManquant(roles: readonly Role[], siteId: bigint | null): boolean {
  return siteId === null && roles.some(estCloisonneParSite)
}
