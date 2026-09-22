import type { ParcoursCode } from '@/server/authz'
import {
  declarantIdentifie,
  destinatairesCircuitCritique,
  titulairesDuDossier,
} from './destinataires'
import { envoyerNotification } from './notification'

/**
 * Réactions aux évènements métier
 *
 * Appelées depuis les SERVICES, pas depuis les Server Actions : une notification oubliée dans
 * une action passerait inaperçue, alors que RG-08 (circuit accéléré) exige une garantie de
 * déclenchement. Les services appellent ces réactions explicitement, au point de bascule.
 *
 * Toutes les fonctions ci-dessous sont « best effort » : un échec d'envoi ne doit JAMAIS annuler
 * l'opération métier qui l'a déclenché. Perdre une notification est regrettable ; perdre une
 * déclaration ne l'est pas.
 */

async function sansPropagerErreur(operation: () => Promise<unknown>, contexte: string): Promise<void> {
  try {
    await operation()
  } catch (erreur) {
    console.error(`Échec d'envoi de notification (${contexte})`, erreur)
  }
}

/**
 * RG-08 / EX-NOT-05 : circuit accéléré pour une déclaration de gravité Critique.
 *
 * Déclenché en SYNCHRONE, jamais via une file : le CDC impose un déclenchement « indépendant de
 * l'heure et du jour », qui ne peut donc pas dépendre de la présence d'un worker.
 */
export async function surDeclarationCritique(
  dossierId: string,
  parcours: ParcoursCode
): Promise<void> {
  await sansPropagerErreur(async () => {
    const destinataires = await destinatairesCircuitCritique(parcours)
    await envoyerNotification({ evenementCode: 'circuit_critique', dossierId, destinataires })
  }, 'circuit_critique')
}

/** EX-NOT-01 : notification à l'affectation d'un dossier. */
export async function surAffectation(dossierId: string): Promise<void> {
  await sansPropagerErreur(async () => {
    const destinataires = await titulairesDuDossier(dossierId)
    if (destinataires.length === 0) return
    await envoyerNotification({ evenementCode: 'dossier_affecte', dossierId, destinataires })
  }, 'dossier_affecte')
}

/**
 * EX-NOT-02 : notification au déclarant IDENTIFIÉ à chaque changement de statut majeur.
 *
 * RGI-10 : le déclarant ne reçoit que le libellé AFFICHÉ du statut, jamais le libellé interne —
 * la projection simplifiée est la seule vue à laquelle il a droit.
 */
export async function surChangementStatut(
  dossierId: string,
  libelleAffiche: string
): Promise<void> {
  await sansPropagerErreur(async () => {
    const destinataires = await declarantIdentifie(dossierId)
    if (destinataires.length === 0) return

    await envoyerNotification({
      evenementCode: 'statut_change',
      dossierId,
      destinataires,
      contexte: { statut: libelleAffiche },
    })
  }, 'statut_change')
}
