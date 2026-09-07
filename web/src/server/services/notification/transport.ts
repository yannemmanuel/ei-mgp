/**
 * Transport d'envoi des e-mails.
 *
 * Volontairement abstrait : le CDC n'impose aucun fournisseur, et la baseline Laravel tourne en
 * `MAIL_MAILER=log` (les messages sont journalisés, pas expédiés). Le portage garde ce
 * comportement par défaut plutôt que de choisir arbitrairement un service tiers.
 *
 * ⚠️ AVANT MISE EN PRODUCTION : brancher un transport réel ici. En l'état, aucune notification
 * par e-mail ne quitte le serveur — ce qui rendrait EX-NOT-02/03/04 inopérants côté déclarant et
 * hiérarchie. Consigné dans MIGRATION_PLAN.md.
 */
export type MessageEmail = {
  readonly destinataire: string
  readonly objet: string
  readonly corps: string
}

export interface TransportEmail {
  envoyer(message: MessageEmail): Promise<void>
}

/** Transport par défaut : journalise, n'expédie rien. Équivalent de `MAIL_MAILER=log`. */
export class TransportJournal implements TransportEmail {
  async envoyer(message: MessageEmail): Promise<void> {
    console.info(
      `[email] à ${message.destinataire} — ${message.objet}\n${message.corps}`
    )
  }
}

let transport: TransportEmail = new TransportJournal()

export function transportEmail(): TransportEmail {
  return transport
}

/** Permet de substituer le transport (tests, ou branchement d'un fournisseur réel). */
export function definirTransportEmail(nouveau: TransportEmail): void {
  transport = nouveau
}
