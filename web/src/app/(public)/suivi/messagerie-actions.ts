'use server'

import { headers } from 'next/headers'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { envoyerMessage, marquerMessagesLus, messagesDuDossier } from '@/server/services/messagerie/messagerie'
import { dossierDeLaSessionSuivi } from '@/server/auth/session-suivi'
import { autoriserTentative, cleThrottle, LIMITE_MESSAGERIE } from '@/server/auth/throttle'

/**
 * Messagerie côté DÉCLARANT (EX-NOT-07) — pendant public de la vue interne.
 *
 * Le dossier consulté n'est JAMAIS fourni par le client : il est relu à chaque appel dans le
 * cookie signé posé par `rechercherDossier`. C'est exactement le `abort_unless(session(...))`
 * de `MessagerieDossier` : le composant ne fait pas confiance au fait d'avoir été monté depuis
 * une vue autorisée. Un identifiant accepté depuis le formulaire ouvrirait la messagerie de
 * n'importe quel dossier sans en connaître le code d'accès.
 */

export type MessageVue = {
  id: string
  cote: 'agent' | 'declarant'
  auteur: string
  corps: string
  envoyeLe: string
}

export type EtatConversation = {
  messages?: MessageVue[]
  erreur?: string
}

const SESSION_EXPIREE =
  'Votre session de suivi a expiré. Saisissez à nouveau votre référence et votre code d’accès.'
const TROP_DE_MESSAGES = 'Trop de messages envoyés. Merci de réessayer plus tard.'

async function adresseIp(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ?? entetes.get('x-real-ip') ?? 'inconnue'
  )
}

async function conversation(dossierId: string): Promise<MessageVue[]> {
  const messages = await messagesDuDossier(dossierId)

  return messages.map((m) => ({
    id: m.id,
    cote: m.expediteur_type === 'agent' ? 'agent' : 'declarant',
    // Parité avec la vue Livewire : le déclarant voit le nom de l'agent qui lui répond, ce qui
    // rend l'échange non anonyme DANS CE SENS uniquement. L'inverse reste impossible.
    auteur: m.expediteur_type === 'agent' ? (m.users?.name ?? 'Agent') : 'Vous',
    corps: m.corps,
    envoyeLe: (m.created_at ?? new Date()).toISOString(),
  }))
}

/** Chargement initial du panneau : marque au passage les messages de l'agent comme lus. */
export async function chargerConversationDeclarant(): Promise<EtatConversation> {
  const dossierId = await dossierDeLaSessionSuivi()

  if (!dossierId) return { erreur: SESSION_EXPIREE }

  await marquerMessagesLus(dossierId, 'declarant')

  return { messages: await conversation(dossierId) }
}

export async function envoyerMessageDeclarant(
  _precedent: EtatConversation,
  donnees: FormData
): Promise<EtatConversation> {
  const dossierId = await dossierDeLaSessionSuivi()

  if (!dossierId) return { erreur: SESSION_EXPIREE }

  const cle = cleThrottle('messagerie-envoi', await adresseIp())

  if (!(await autoriserTentative(cle, Date.now(), LIMITE_MESSAGERIE))) {
    return { erreur: TROP_DE_MESSAGES, messages: await conversation(dossierId) }
  }

  try {
    await envoyerMessage({
      dossierId,
      expediteur: 'declarant',
      corps: String(donnees.get('corps') ?? ''),
      // Aucun `expediteurUserId` : le service le forcerait à NULL de toute façon (RG-06), mais
      // ne pas l'écrire ici évite qu'un futur remaniement le rende possible par inadvertance.
    })
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) {
      return { erreur: erreur.message, messages: await conversation(dossierId) }
    }

    console.error('Envoi de message déclarant en échec', erreur)
    return {
      erreur: "Le message n'a pas pu être envoyé. Vous pouvez réessayer.",
      messages: await conversation(dossierId),
    }
  }

  return { messages: await conversation(dossierId) }
}
