import { configurationSmtp, transportEmail } from '../notification/transport'
import { MODELES, journaliser } from '../audit/journal'
import { VALIDITE_HEURES } from './invitation'

/**
 * Remise de l'accès par e-mail, à la création d'un compte.
 *
 * Le message ne porte AUCUN mot de passe. Il porte un lien à usage unique, qui ouvre une fois un
 * écran où la personne choisit sa propre valeur — que ni l'administrateur, ni quiconque aurait lu
 * le courriel n'aura jamais connue.
 *
 * ⚠️ C'est un changement de nature, pas de forme. Un mot de passe envoyé par courriel y reste
 * aussi longtemps que le message : dans une boîte de réception, sur un serveur relais, dans une
 * sauvegarde — et il ouvre le compte à qui l'y retrouve, des mois plus tard. Le lien, lui, est
 * mort passé trois jours ou une utilisation, selon ce qui vient en premier.
 *
 * ⚠️ Cet envoi ne passe PAS par `envoyerNotification()`. Ce service est centré sur le dossier : il
 * en exige un identifiant, résout ses gabarits par évènement × parcours et journalise l'envoi
 * contre lui. Un courriel de création de compte n'a pas de dossier — lui en inventer un aurait
 * fabriqué une déclaration fantôme pour satisfaire une signature.
 */

export type ResultatEnvoiIdentifiants =
  /** Le message est parti. */
  | { readonly etat: 'expedie' }
  /**
   * Aucun SMTP configuré : rien n'a été envoyé, DÉLIBÉRÉMENT.
   *
   * ⚠️ Le transport de repli (`TransportJournal`) écrit le corps entier sur la sortie standard.
   * L'utiliser ici aurait recopié le lien d'invitation dans les traces du serveur, où il serait
   * resté valable trois jours pour quiconque y a accès. On préfère ne pas expédier et le dire :
   * l'appelant bascule alors sur un mot de passe remis en main propre.
   */
  | { readonly etat: 'sans_transport' }
  /** Le SMTP a refusé ou n'a pas répondu. Le compte, lui, existe bel et bien. */
  | { readonly etat: 'echec'; readonly raison: string }

/**
 * Chemin de la page de connexion.
 *
 * ⚠️ Recopié de `pages.signIn` dans `server/auth/config.ts`, et non importé : ce module-là
 * initialise NextAuth au chargement, ce qu'un service d'envoi de courriel n'a aucune raison de
 * déclencher. La copie est tenue en phase par un test qui lit les deux — un lien de connexion
 * mort dans le seul message que reçoit un nouvel arrivant serait une première impression
 * difficile à rattraper.
 */
export const CHEMIN_CONNEXION = '/login'

function racine(): string {
  return (process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function urlConnexion(): string {
  return `${racine()}${CHEMIN_CONNEXION}`
}

/** L'adresse du lien d'invitation. Le jeton est dans le CHEMIN, jamais en paramètre de requête. */
export function urlInvitation(jeton: string): string {
  /*
    Dans le chemin, et pas après un « ? ».

    Une chaîne de requête se retrouve dans les journaux d'accès du serveur, dans l'en-tête
    `Referer` envoyé aux ressources tierces, et dans l'historique des proxys. Le segment de
    chemin n'échappe pas à tout cela, mais il évite la classe d'incidents la plus courante — un
    jeton recopié en clair dans une ligne de log par le seul fait d'avoir été visité.
  */
  return `${racine()}/premiere-connexion/${jeton}`
}

function corps(params: { nom: string; email: string; jeton: string }): string {
  // Texte brut, comme tout ce que `TransportSmtp` expédie : pas de HTML à assainir, et le message
  // reste lisible dans n'importe quel client, y compris en consultation mobile dégradée.
  return [
    `Bonjour ${params.nom},`,
    '',
    'Un compte vient de vous être ouvert sur la plateforme de gestion des plaintes et',
    'des évènements indésirables.',
    '',
    `Votre identifiant : ${params.email}`,
    '',
    'Pour choisir votre mot de passe, ouvrez ce lien :',
    urlInvitation(params.jeton),
    '',
    `Il est valable ${VALIDITE_HEURES} heures et ne fonctionnera qu’une fois. Passé ce délai,`,
    'demandez-en un nouveau à votre administrateur.',
    '',
    `Vous vous connecterez ensuite ici : ${urlConnexion()}`,
    '',
    'Si vous n’attendiez pas ce message, signalez-le à votre administrateur : quelqu’un a',
    'ouvert un compte à votre nom.',
  ].join('\n')
}

/**
 * Envoie son lien d'accès à la personne dont le compte vient d'être créé.
 *
 * ⚠️ Ne lève JAMAIS. La création du compte est déjà validée et écrite quand cette fonction est
 * appelée : laisser remonter une panne SMTP annulerait, aux yeux de l'administrateur, une
 * opération qui a bel et bien eu lieu — il recréerait alors le compte et se heurterait au doublon
 * d'adresse. L'échec est donc RENDU, pas lancé, et l'écran le dit.
 */
export async function envoyerIdentifiants(params: {
  utilisateurId: bigint
  acteurId: bigint
  nom: string
  email: string
  /** Jeton d'invitation en clair. Il n'existe sous cette forme que le temps de cet envoi. */
  jeton: string
}): Promise<ResultatEnvoiIdentifiants> {
  if (configurationSmtp() === null) {
    return { etat: 'sans_transport' }
  }

  try {
    await transportEmail().envoyer({
      destinataire: params.email,
      objet: 'Votre accès à la plateforme EI / MGP',
      corps: corps(params),
    })
  } catch (erreur) {
    // La raison est tracée côté serveur pour le diagnostic, jamais le contenu du message.
    console.error('Envoi du lien d’accès en échec', erreur)

    return {
      etat: 'echec',
      raison: erreur instanceof Error ? erreur.message : 'cause inconnue',
    }
  }

  /*
    Consigné : une remise d'accès est un évènement de sécurité.

    On enregistre QU'UN envoi a eu lieu, vers quelle adresse, et par qui — jamais le jeton, qui
    ouvrirait le compte à quiconque lirait le journal. Celui-ci doit répondre à « qui a reçu de
    quoi se connecter, et quand », ce qui n'exige à aucun moment de connaître le secret lui-même.
  */
  await journaliser({
    action: 'user.identifiants_envoyes',
    acteurId: params.acteurId,
    auditableType: MODELES.utilisateur,
    auditableId: String(params.utilisateurId),
    nouvelles: { email: params.email },
  })

  return { etat: 'expedie' }
}
