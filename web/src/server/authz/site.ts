import type { Permission } from './permissions'
import { aPermission } from './utilisateur'

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
/*
  ⚠️ LA LISTE DES RÔLES CLOISONNÉS A QUITTÉ LE CODE.

  Elle y était écrite nom par nom : un rôle créé depuis l'interface n'y figurait pas, n'était donc
  borné par aucun rattachement, et voyait tous les sites. Rien ne le signalait.

  Elle se coche désormais rôle par rôle dans les habilitations, et se lit sur le compte —
  `UtilisateurAutorise.cloisonneParRattachement`, résolu à chaque requête comme les permissions.
*/

/**
 * Les droits qui font d'un rôle un PORTEUR d'accès aux dossiers.
 *
 * ⚠️ Un rôle qui n'en porte aucun n'entre pas dans le calcul du cloisonnement. `agent_relais` ne
 * donne accès à aucun dossier : il ne desserre rien, mais il ne doit rien desserrer non plus. Le
 * cumuler avec un rôle cloisonné ne doit pas lever le cloisonnement.
 */
const ACCES_AUX_DOSSIERS = ['dossiers.view', 'dossiers.view.all', 'dossiers.view.own'] as const

/** Ce rôle donne-t-il accès à des dossiers ? Lu dans ses permissions, jamais dans son nom. */
export function donneAccesAuxDossiers(permissions: Iterable<string>): boolean {
  const portees = new Set(permissions)

  return ACCES_AUX_DOSSIERS.some((droit) => portees.has(droit))
}

/**
 * Ce compte est-il borné à son rattachement, d'après les rôles qu'il porte ?
 *
 * ⚠️ TOUS, PAS UN SEUL — et c'est la règle que le passage en base a failli perdre.
 *
 * Cumuler « Secrétaire CSST » et « Correspondant MGP », ce n'est pas être deux fois restreint :
 * c'est porter un mandat plus large. Restreindre alors retirerait des dossiers que le second rôle
 * donne le droit de voir, et masquer est la direction dangereuse de l'erreur. Le compte n'est donc
 * borné que si CHACUN de ses rôles porteurs d'accès le prévoit.
 *
 * ⚠️ Un compte sans aucun rôle porteur n'est pas borné : il n'a rien à voir de toute façon, et le
 * déclarer cloisonné reviendrait à inventer une restriction sur un périmètre vide.
 *
 * Écrit ICI plutôt que dans chacun des quatre endroits qui chargent un compte : trois d'entre eux
 * le construisent à la main, et une règle recopiée trois fois finit par diverger — l'écart ne se
 * voyant alors que sur un dossier montré à quelqu'un qui n'y a pas droit.
 */
export function cloisonnePourSesRoles(
  roles: readonly { readonly cloisonne: boolean; readonly donneAcces: boolean }[]
): boolean {
  const porteurs = roles.filter((role) => role.donneAcces)

  return porteurs.length > 0 && porteurs.every((role) => role.cloisonne)
}

/**
 * Ce qu'il faut savoir d'un compte pour décider de son cloisonnement — et rien de plus.
 *
 * ⚠️ VOLONTAIREMENT PLUS ÉTROIT QUE `UtilisateurAutorise`. Deux services construisent une
 * photographie d'autorisation à la main pour poser cette seule question : l'affectation à la
 * création, et la liste des traitants. Exiger le type complet les obligeait à inventer une valeur
 * pour chaque champ qui ne les concerne pas — la charge, les étapes, l'identité du déclarant — et
 * une valeur inventée se lit comme une vérité partout où l'objet circule ensuite. Le jour où l'une
 * d'elles arriverait devant `peutFaireAvancerDepuis()`, la réponse serait « non » sans qu'aucune
 * erreur ne soit levée.
 *
 * Un `UtilisateurAutorise` complet reste accepté : il porte tous ces champs.
 */
export type PourCloisonnement = {
  readonly siteId: bigint | null
  readonly directionId: bigint | null
  readonly permissions: ReadonlySet<Permission>
  readonly cloisonneParRattachement: boolean
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
 *
 * ⚠️ Les points 2 et 3 sont désormais portés par `cloisonneParRattachement`, que chaque chargement
 * calcule par `cloisonnePourSesRoles()` — « TOUS ses rôles porteurs le prévoient », et non « au
 * moins un ». La nuance décide de dossiers : la perdre aurait retiré, sans erreur ni message, ce
 * qu'un second rôle donnait le droit de voir.
 */
function estSoumisAuRattachement(u: PourCloisonnement): boolean {
  if (aPermission(u, 'dossiers.view.all')) return false

  return u.cloisonneParRattachement
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
export function directionCloisonnante(u: PourCloisonnement): bigint | null {
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
export function siteCloisonnant(u: PourCloisonnement): bigint | null {
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
  u: PourCloisonnement,
  dossier: { readonly siteId: bigint | null; readonly directionId: bigint | null }
): boolean {
  // La direction d'abord : plus fine, et `siteCloisonnant()` s'efface devant elle.
  const direction = directionCloisonnante(u)
  if (direction !== null) return dossier.directionId === direction

  const site = siteCloisonnant(u)
  return site === null || dossier.siteId === site
}

export function siteManquant(
  cloisonneParRattachement: boolean,
  siteId: bigint | null,
  directionId: bigint | null = null
): boolean {
  return siteId === null && directionId === null && cloisonneParRattachement
}
