import { createTransport, type Transporter } from 'nodemailer'

/**
 * Transport d'envoi des e-mails.
 *
 * Le transport réel est choisi par la CONFIGURATION, jamais par le code : si les variables SMTP
 * sont renseignées, les messages partent ; sinon ils sont journalisés, comme le fait la baseline
 * la console, comme un mode « journal ».
 *
 * Ce choix évite le piège symétrique des deux extrêmes : imposer un fournisseur dans le code, ou
 * laisser un environnement de production croire qu'il envoie alors qu'il journalise. Le démarrage
 * annonce lequel des deux est actif.
 */
export type MessageEmail = {
  readonly destinataire: string
  readonly objet: string
  readonly corps: string
}

export interface TransportEmail {
  envoyer(message: MessageEmail): Promise<void>
}

/** Transport de repli : journalise, n'expédie rien. Équivalent de `MAIL_MAILER=log`. */
export class TransportJournal implements TransportEmail {
  async envoyer(message: MessageEmail): Promise<void> {
    console.info(`[email non expédié] à ${message.destinataire} — ${message.objet}\n${message.corps}`)
  }
}

export type ConfigurationSmtp = {
  readonly hote: string
  readonly port: number
  readonly securise: boolean
  readonly utilisateur?: string
  readonly motDePasse?: string
  readonly expediteur: string
}

/**
 * Configuration SMTP lue dans l'environnement.
 *
 * `null` si l'hôte ou l'adresse d'expédition manque : mieux vaut un repli explicite qu'un
 * transport à moitié configuré qui échouerait à chaque envoi.
 */
export function configurationSmtp(): ConfigurationSmtp | null {
  const hote = process.env.MAIL_HOST?.trim()
  const expediteur = process.env.MAIL_FROM?.trim()

  if (!hote || !expediteur) return null

  const port = Number(process.env.MAIL_PORT ?? 587)

  return {
    hote,
    port: Number.isFinite(port) ? port : 587,
    // 465 impose TLS implicite ; 587 utilise STARTTLS, que nodemailer négocie seul.
    securise: process.env.MAIL_SECURE === 'true' || port === 465,
    utilisateur: process.env.MAIL_USER?.trim() || undefined,
    motDePasse: process.env.MAIL_PASSWORD || undefined,
    expediteur,
  }
}

export class TransportSmtp implements TransportEmail {
  private readonly transporteur: Transporter
  private readonly expediteur: string

  constructor(config: ConfigurationSmtp) {
    this.expediteur = config.expediteur
    this.transporteur = createTransport({
      host: config.hote,
      port: config.port,
      secure: config.securise,
      auth:
        config.utilisateur && config.motDePasse
          ? { user: config.utilisateur, pass: config.motDePasse }
          : undefined,
      // Ferme les portes que l'avis GHSA-p6gq-j5cr-w38f concerne : aucun message construit ici
      // n'utilise `raw`, mais ces drapeaux rendent la garantie explicite plutôt que tacite.
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  }

  async envoyer(message: MessageEmail): Promise<void> {
    await this.transporteur.sendMail({
      from: this.expediteur,
      to: message.destinataire,
      subject: message.objet,
      text: message.corps,
    })
  }
}

function transportParDefaut(): TransportEmail {
  const config = configurationSmtp()

  if (!config) {
    console.warn(
      'MAIL_HOST ou MAIL_FROM absent : les notifications par e-mail sont JOURNALISÉES, pas expédiées.'
    )
    return new TransportJournal()
  }

  console.info(`Transport e-mail SMTP actif (${config.hote}:${config.port}).`)
  return new TransportSmtp(config)
}

let transport: TransportEmail | null = null

export function transportEmail(): TransportEmail {
  transport ??= transportParDefaut()
  return transport
}

/** Permet de substituer le transport (tests, ou branchement d'un fournisseur particulier). */
export function definirTransportEmail(nouveau: TransportEmail): void {
  transport = nouveau
}

/** Réservé aux tests : refait le choix à partir de l'environnement courant. */
export function reinitialiserTransportEmail(): void {
  transport = null
}
