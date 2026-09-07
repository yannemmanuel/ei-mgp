'use server'

import { exigerUtilisateur } from '@/server/auth'
import { marquerLue, toutMarquerLu } from '@/server/services/notification/boite'

/**
 * Actions du centre de notifications.
 *
 * L'identifiant du destinataire vient TOUJOURS de la session, jamais du formulaire : c'est ce
 * qui empêche de marquer lues les notifications d'autrui en rejouant l'action avec un autre id.
 */

export async function actionMarquerNotificationLue(notificationId: string): Promise<void> {
  const utilisateur = await exigerUtilisateur()
  await marquerLue(utilisateur.id, notificationId)
}

export async function actionToutMarquerLu(): Promise<void> {
  const utilisateur = await exigerUtilisateur()
  await toutMarquerLu(utilisateur.id)
}
