'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import {
  peutCloturerAction,
  peutCreerAction,
  peutModifierAction,
  peutVerifierEfficacite,
  type ParcoursCode,
} from '@/server/authz'
import {
  changerStatutAction,
  cloturerAction,
  creerAction,
  verifierEfficacite,
  STATUTS_ACTION,
  type StatutAction,
} from '@/server/services/action-corrective/action-corrective'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import type { EtatAction } from './actions'

/**
 * Actions du module Actions correctives (EX-ACT-01 à 05).
 *
 * Chaque appel revérifie l'autorisation côté serveur, indépendamment du masquage des commandes
 * dans l'interface.
 */

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message

  console.error('Action corrective en échec', erreur)
  return "L'opération n'a pas pu aboutir. Aucune donnée n'a été perdue : vous pouvez réessayer."
}

async function parcoursDuDossier(dossierId: string): Promise<ParcoursCode | null> {
  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: { parcours: { select: { code: true } } },
  })

  return (dossier?.parcours.code as ParcoursCode) ?? null
}

/** Contexte d'autorisation d'une action : parcours du dossier parent. */
async function contexteAction(actionId: string) {
  const action = await prisma.actions_correctives.findUnique({
    where: { id: actionId },
    select: { dossier_id: true, dossiers: { select: { parcours: { select: { code: true } } } } },
  })

  if (!action) return null

  return {
    dossierId: action.dossier_id,
    parcoursCode: action.dossiers.parcours.code as ParcoursCode,
  }
}

export async function actionCreerActionCorrective(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const parcoursCode = await parcoursDuDossier(dossierId)

  if (!parcoursCode || !peutCreerAction(utilisateur, { parcoursCode })) {
    return { erreur: REFUS }
  }

  // Saisi à la main : le responsable n'est plus choisi parmi les comptes. `creerAction` revérifie
  // qu'il n'est pas vide — ce contrôle-ci ne fait qu'éviter un aller-retour inutile.
  const responsableNom = String(donnees.get('responsableNom') ?? '').trim()
  const echeanceBrute = String(donnees.get('echeance') ?? '')

  if (responsableNom === '') return { erreur: 'Merci d’indiquer le responsable de l’action.' }

  const echeance = new Date(echeanceBrute)
  if (Number.isNaN(echeance.getTime())) {
    return { erreur: 'Merci d’indiquer une date d’échéance valide.' }
  }

  try {
    await creerAction({
      dossierId,
      investigationId: String(donnees.get('investigationId') ?? '') || null,
      intitule: String(donnees.get('intitule') ?? ''),
      description: String(donnees.get('description') ?? ''),
      responsableNom,
      echeance,
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Action corrective créée.' }
}

export async function actionAvancerAction(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const actionId = String(donnees.get('actionId') ?? '')
  const contexte = await contexteAction(actionId)

  if (!contexte || !peutModifierAction(utilisateur, contexte)) {
    return { erreur: REFUS }
  }

  // Validation réelle : la valeur vient d'un formulaire et peut avoir été forgée.
  const versBrut = String(donnees.get('vers') ?? '')
  if (!(STATUTS_ACTION as readonly string[]).includes(versBrut)) {
    return { erreur: 'Statut invalide.' }
  }

  try {
    await changerStatutAction({ actionId, vers: versBrut as StatutAction })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${contexte.dossierId}`)
  return { succes: 'Avancement mis à jour.' }
}

export async function actionVerifierEfficacite(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const actionId = String(donnees.get('actionId') ?? '')
  const contexte = await contexteAction(actionId)

  if (!contexte || !peutVerifierEfficacite(utilisateur, contexte)) {
    return { erreur: REFUS }
  }

  try {
    await verifierEfficacite({
      actionId,
      efficace: donnees.get('efficace') === 'oui',
      commentaire: String(donnees.get('commentaire') ?? '') || null,
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${contexte.dossierId}`)
  return { succes: 'Vérification enregistrée.' }
}

export async function actionCloturerActionCorrective(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const actionId = String(donnees.get('actionId') ?? '')
  const contexte = await contexteAction(actionId)

  if (!contexte || !peutCloturerAction(utilisateur, contexte)) {
    return { erreur: REFUS }
  }

  try {
    await cloturerAction({ actionId, acteurId: utilisateur.id })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${contexte.dossierId}`)
  return { succes: 'Action clôturée.' }
}
