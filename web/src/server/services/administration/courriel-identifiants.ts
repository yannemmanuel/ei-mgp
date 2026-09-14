import { configurationSmtp, transportEmail } from '../notification/transport'
import { MODELES, journaliser } from '../audit/journal'

/**
 * Remise des identifiants par e-mail, à la création d'un compte.
 *
 * Jusqu'ici le mot de passe initial s'affichait une fois à l'écran de l'administrateur, qui
 * devait le transmettre lui-même. Le métier demande que la personne le reçoive directement.
 *
 * ⚠️ Cet envoi ne passe PAS par `envoyerNotification()`. Ce service est centré sur le dossier :
 * il en exige un identifiant, résout ses gabarits par évènement × parcours et journalise l'envoi
 * contre lui. Un courriel de création de compte n'a pas de dossier — lui en inventer un aurait
 * fabriqué une déclaration fantôme pour satisfaire une signature.
 *
 * ⚠️ Le mot de passe transite en clair dans le corps du message. C'est inhérent à la demande, et
 * trois choses le rendent tenable :
 *
 * 1. Le compte porte `doit_changer_mot_de_passe` : la valeur envoyée ne sert qu'une fois, et
 *    l'application n'en laisse pas sortir avant remplacement.
 * 2. Rien n'est journalisé du mot de passe — ni ici, ni dans l'audit, ni dans les traces.
 * 3. Sans SMTP configuré, on n'envoie RIEN plutôt que de replier sur le transport de
 *    journalisation : voir `SANS_TRANSPORT` ci-dessous.
 */

export type ResultatEnvoiIdentifiants =
  /** Le message est parti. */
  | { readonly etat: 'expedie' }
  /**
   * Aucun SMTP configuré : rien n'a été envoyé, DÉLIBÉRÉMENT.
   *
   * ⚠️ Le transport de repli (`TransportJournal`) écrit le corps entier sur la sortie standard.
   * L'utiliser ici aurait recopié le mot de passe en clair dans les traces du serveur, où il
   * serait resté — l'exact contraire de la règle que tout le reste du code respecte. On préfère
   * donc ne pas expédier et le dire : l'administrateur garde la valeur à l'écran et la remet en
   * main propre, comme avant.
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

function urlConnexion(): string {
  return `${(process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')}${CHEMIN_CONNEXION}`
}

function corps(params: { nom: string; email: string; motDePasse: string }): string {
  // Texte brut, comme tout ce que `TransportSmtp` expédie : pas de HTML à assainir, et le message
  // reste lisible dans n'importe quel client, y compris en consultation mobile dégradée.
  return [
    `Bonjour ${params.nom},`,
    '',
    'Un compte vient de vous être ouvert sur la plateforme de gestion des plaintes et',
    'des évènements indésirables.',
    '',
    `Adresse de connexion : ${urlConnexion()}`,
    `Identifiant : ${params.email}`,
    `Mot de passe provisoire : ${params.motDePasse}`,
    '',
    'Ce mot de passe a été attribué par un tiers : il vous sera demandé de le remplacer',
    'dès votre première connexion, et vous ne pourrez rien faire d’autre avant.',
    '',
    'Si vous n’attendiez pas ce message, signalez-le à votre administrateur : quelqu’un a',
    'ouvert un compte à votre nom.',
  ].join('\n')
}

/**
 * Envoie ses identifiants à la personne dont le compte vient d'être créé.
 *
 * ⚠️ Ne lève JAMAIS. La création du compte est déjà validée et écrite quand cette fonction est
 * appelée : laisser remonter une panne SMTP annulerait, aux yeux de l'administrateur, une
 * opération qui a bel et bien eu lieu — il recréerait alors le compte, se heurterait au doublon
 * d'adresse, et perdrait au passage le mot de passe affiché. L'échec est donc RENDU, pas lancé, et
 * l'écran le dit.
 */
export async function envoyerIdentifiants(params: {
  utilisateurId: bigint
  acteurId: bigint
  nom: string
  email: string
  motDePasse: string
}): Promise<ResultatEnvoiIdentifiants> {
  if (configurationSmtp() === null) {
    return { etat: 'sans_transport' }
  }

  try {
    await transportEmail().envoyer({
      destinataire: params.email,
      objet: 'Vos identifiants de connexion',
      corps: corps(params),
    })
  } catch (erreur) {
    // La raison est tracée côté serveur pour le diagnostic, jamais le contenu du message.
    console.error('Envoi des identifiants en échec', erreur)

    return {
      etat: 'echec',
      raison: erreur instanceof Error ? erreur.message : 'cause inconnue',
    }
  }

  /*
    Consigné : une remise d'identifiants est un évènement de sécurité.

    On enregistre QU'UN envoi a eu lieu, vers quelle adresse, et par qui — jamais le mot de passe.
    Le journal doit permettre de répondre à « qui a reçu de quoi se connecter, et quand », ce qui
    n'exige à aucun moment de connaître le secret lui-même.
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
