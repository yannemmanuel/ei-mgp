'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  basculerActifQrCode,
  genererQrCode,
  modifierUrlCible,
} from '@/server/services/administration/qr-codes'
import type { EtatFormulaire } from '../editeur-referentiel'

/** Console des QR codes — l'autorisation est revérifiée à chaque action. */
const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

async function acteurAutorise() {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur || !aPermission(utilisateur, 'qrcodes.manage')) return null

  return utilisateur
}

function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message

  console.error('Action QR code en échec', erreur)
  return "L'opération n'a pas abouti. Vous pouvez réessayer."
}

export async function actionGenererQrCode(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise()
  if (!acteur) return { erreur: REFUS }

  const parcoursId = String(donnees.get('parcoursId') ?? '').trim()
  if (parcoursId === '') return { erreur: 'Merci de choisir un parcours.' }

  try {
    await genererQrCode(acteur, BigInt(parcoursId))
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/qr-codes')
  return { succes: 'QR code généré.' }
}

export async function actionModifierUrlCible(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise()
  if (!acteur) return { erreur: REFUS }

  const qrCodeId = String(donnees.get('qrCodeId') ?? '').trim()
  const urlCible = String(donnees.get('urlCible') ?? '').trim()

  if (qrCodeId === '') return { erreur: 'QR code introuvable.' }

  try {
    await modifierUrlCible(acteur, qrCodeId, urlCible)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/qr-codes')
  return { succes: 'URL cible enregistrée (valeur documentaire — voir la note de l’écran).' }
}

export async function actionBasculerQrCode(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise()
  if (!acteur) return { erreur: REFUS }

  const qrCodeId = String(donnees.get('qrCodeId') ?? '').trim()
  if (qrCodeId === '') return { erreur: 'QR code introuvable.' }

  let actif: boolean

  try {
    actif = await basculerActifQrCode(acteur, qrCodeId)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/qr-codes')
  return { succes: actif ? 'QR code réactivé.' : 'QR code désactivé.' }
}
