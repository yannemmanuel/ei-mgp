import type { Role } from './roles'
import { aPermission, type UtilisateurAutorise } from './utilisateur'

/**
 * Cloisonnement par RATTACHEMENT — site ou direction.
 *
 * « On peut être habilité sur un site, c'est-à-dire plusieurs directions à la fois, ou sur une
 * seule direction. Dans ce cas, on ne reçoit que les déclarations de la direction sur laquelle on
 * est habilité. »
 *
 * Les deux granularités sont EXCLUSIVES : un compte porte un site OU une direction, jamais les
 * deux (l'écran de création grise l'un dès que l'autre est choisi). La direction est la plus
 * fine ; le site couvre toutes les directions qui lui sont rattachées.
 *
 * Le site d'un dossier n'est pas saisi : il découle de la direction concernée
 * (`directions.site_id`), elle-même choisie à la déclaration.
 *
 * Ce cloisonnement s'AJOUTE à celui par parcours, il ne le remplace pas : un secrétaire CSST reste
 * borné aux dossiers `ei_employe`, et parmi eux à ceux de son rattachement.
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
 * Ce compte est-il soumis au cloisonnement par rattachement ?
 *
 * Extrait de `siteCloisonnant()` pour que la règle de DIRECTION se pose exactement sur la même
 * garde. Deux conditions recopiées finiraient par diverger, et l'écart ne se verrait que sur un
 * dossier montré à quelqu'un qui n'y a pas droit.
 *
 * Trois raisons de ne pas l'être, et chacune compte :
 *
 * 1. **Un accès transverse.** `dossiers.view.all` est accordé aux rôles que le CDC veut sur les
 *    quatre parcours : le rattachement ne les concerne pas.
 * 2. **Aucun rôle porteur.** `agent_relais` ne donne accès à aucun dossier : il ne desserre rien,
 *    mais il ne restreint rien non plus.
 * 3. **Un rôle non cloisonné en plus.** Cumuler « Secrétaire CSST » et « Correspondant MGP », ce
 *    n'est pas être deux fois restreint, c'est porter un mandat plus large. Restreindre alors
 *    retirerait des dossiers que le second rôle donne le droit de voir — et masquer est la
 *    direction dangereuse de l'erreur.
 */
function estSoumisAuRattachement(u: UtilisateurAutorise): boolean {
  if (aPermission(u, 'dossiers.view.all')) return false

  const rolesPortant = u.roles.filter((role) => role !== 'agent_relais')

  if (rolesPortant.length === 0) return false

  return rolesPortant.every(estCloisonneParSite)
}

/**
 * Direction à laquelle cet utilisateur est borné, ou `null` s'il ne l'est pas.
 *
 * ⚠️ PLUS FINE QUE LE SITE, et prioritaire sur lui : un compte habilité sur une seule direction ne
 * reçoit que les déclarations de cette direction, pas celles des autres directions de son site.
 *
 * ⚠️ UN DOSSIER SANS DIRECTION N'EST VU D'AUCUN COMPTE AINSI BORNÉ. C'est le cas de tous les
 * griefs communautaires et sous-traitants, qui n'ont pas de direction concernée : être habilité
 * sur une direction, c'est être habilité sur ce qui relève d'elle. Le contraire — les montrer
 * faute de mieux — reviendrait à annuler le cloisonnement sur les parcours qui n'en portent pas.
 *
 * ⚠️ LA DIRECTION L'EMPORTE quand les deux colonnes sont renseignées, ce que l'écran de création
 * empêche mais que d'anciennes lignes portent encore. Pour un cloisonnement, la bonne erreur est
 * de restreindre : retenir le site montrerait à ce compte toutes les autres directions.
 * `/administration/utilisateurs` signale déjà ces rattachements incohérents.
 */
export function directionCloisonnante(u: UtilisateurAutorise): bigint | null {
  if (u.directionId === null) return null
  if (!estSoumisAuRattachement(u)) return null

  return u.directionId
}

/**
 * Site auquel cet utilisateur est borné, ou `null` s'il ne l'est pas.
 *
 * ⚠️ REND `null` DÈS QU'UNE DIRECTION BORNE LE COMPTE : la direction est plus fine, et appliquer
 * les deux en même temps refuserait des dossiers légitimes. Un dossier de la direction 2 peut
 * n'avoir aucun site — la direction n'étant rattachée à aucun —, et le contrôle par site le
 * rejetterait alors même que la direction correspond.
 *
 * Deux autres raisons de ne pas être borné :
 *
 * 1. **Aucun rattachement sur le compte.** Ni site ni direction : on ne restreint pas. Le
 *    contraire — « pas de site, donc rien » — transformerait un oubli de paramétrage en écran
 *    vide sans explication, sur des comptes qui travaillaient la veille. La console des comptes
 *    signale ces cas plutôt que de les faire échouer en silence.
 * 2. **Un accès transverse ou un rôle non cloisonné** — voir `estSoumisAuRattachement()`.
 */
export function siteCloisonnant(u: UtilisateurAutorise): bigint | null {
  if (directionCloisonnante(u) !== null) return null
  if (u.siteId === null) return null
  if (!estSoumisAuRattachement(u)) return null

  return u.siteId
}

/**
 * Un compte devrait-il porter un rattachement sans en avoir aucun ?
 *
 * Sert à alerter dans la console des comptes : un secrétaire sans rattachement voit tous les
 * dossiers de son parcours, ce qui est exactement ce que le cloisonnement doit empêcher.
 *
 * ⚠️ UNE DIRECTION SUFFIT, et c'est le sens du second paramètre. Alerter sur un compte habilité
 * sur une seule direction serait une fausse alerte : il est borné, et plus étroitement qu'un
 * compte de site. La faire disparaître de la console est ce qui garde les vraies alertes
 * crédibles.
 */
/**
 * Ce compte répond-il de ce dossier, au titre de son rattachement ?
 *
 * ⚠️ LE PRÉDICAT UNIQUE. Trois endroits posent la même question — qui voit le dossier, qui le
 * reçoit à la création, et qui en a la charge sur un évènement indésirable — et chacun la posait
 * à sa façon. Deux d'entre eux se sont déjà trompés : l'affectation affectait à tout le monde un
 * dossier sans site, et le suivi EI ne retenait personne dès que le dossier n'en avait pas.
 *
 * Ce n'est PAS un contrôle d'accès complet : il ne dit rien du parcours ni des permissions. Il ne
 * répond qu'à la question du rattachement, et `peutVoirDossier()` reste seul juge de l'accès.
 */
export function rattachementCouvre(
  u: UtilisateurAutorise,
  dossier: { readonly siteId: bigint | null; readonly directionId: bigint | null }
): boolean {
  // La direction d'abord : plus fine, et `siteCloisonnant()` s'efface devant elle.
  const direction = directionCloisonnante(u)
  if (direction !== null) return dossier.directionId === direction

  const site = siteCloisonnant(u)
  return site === null || dossier.siteId === site
}

export function siteManquant(
  roles: readonly Role[],
  siteId: bigint | null,
  directionId: bigint | null = null
): boolean {
  return siteId === null && directionId === null && roles.some(estCloisonneParSite)
}
