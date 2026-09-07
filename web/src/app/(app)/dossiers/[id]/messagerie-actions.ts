'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import { peutEnvoyerMessage, type ParcoursCode } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { envoyerMessage } from '@/server/services/messagerie/messagerie'
import type { EtatAction } from './actions'

/**
 * Messagerie côté ACTEUR authentifié (EX-NOT-07).
 *
 * Symétrique de `(public)/suivi/messagerie-actions.ts`, mais l'autorisation passe ici par
 * `MessagePolicy` — permission `messagerie.send` ET cloisonnement par parcours. Aucune limite de
 * débit : elle ne protège que le canal public, un compte interne étant déjà tracé et révocable.
 */

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

export async function actionEnvoyerMessageAgent(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')

  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: { parcours: { select: { code: true } } },
  })

  if (!dossier) return { erreur: REFUS }

  const parcoursCode = dossier.parcours.code as ParcoursCode

  if (!peutEnvoyerMessage(utilisateur, { parcoursCode })) {
    return { erreur: REFUS }
  }

  try {
    await envoyerMessage({
      dossierId,
      expediteur: 'agent',
      corps: String(donnees.get('corps') ?? ''),
      expediteurUserId: utilisateur.id,
    })
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Envoi de message agent en échec', erreur)
    return { erreur: "Le message n'a pas pu être envoyé. Vous pouvez réessayer." }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Message envoyé.' }
}
