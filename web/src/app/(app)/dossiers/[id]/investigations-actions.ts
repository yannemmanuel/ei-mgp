'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import {
  peutCreerInvestigation,
  peutModifierInvestigation,
  peutValiderInvestigation,
  type ParcoursCode,
} from '@/server/authz'
import {
  mettreAJourInvestigation,
  ouvrirInvestigation,
  soumettrePourValidation,
  validerInvestigation,
} from '@/server/services/investigation/investigation'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import type { EtatAction } from './actions'

/**
 * Actions du module Investigations (EX-INV-01 à 05).
 *
 * Comme pour les actions de dossier, l'autorisation est revérifiée ici à chaque appel : le
 * masquage d'un bouton n'est jamais un contrôle d'accès.
 */

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message

  console.error('Action investigation en échec', erreur)
  return "L'opération n'a pas pu aboutir. Aucune donnée n'a été perdue : vous pouvez réessayer."
}

async function parcoursDuDossier(dossierId: string): Promise<ParcoursCode | null> {
  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: { parcours: { select: { code: true } } },
  })

  return (dossier?.parcours.code as ParcoursCode) ?? null
}

/** Contexte d'autorisation d'une investigation : parcours du dossier parent + enquêteur. */
async function contexteInvestigation(investigationId: string) {
  const investigation = await prisma.investigations.findUnique({
    where: { id: investigationId },
    select: {
      id: true,
      enqueteur_id: true,
      dossier_id: true,
      dossiers: { select: { parcours: { select: { code: true } } } },
    },
  })

  if (!investigation) return null

  return {
    dossierId: investigation.dossier_id,
    parcoursCode: investigation.dossiers.parcours.code as ParcoursCode,
    enqueteurId: investigation.enqueteur_id,
  }
}

function donneesDepuis(donnees: FormData) {
  return {
    faitsConstates: String(donnees.get('faitsConstates') ?? ''),
    personnesRencontrees: String(donnees.get('personnesRencontrees') ?? '') || null,
    causeImmediate: String(donnees.get('causeImmediate') ?? '') || null,
    causesRacines: String(donnees.get('causesRacines') ?? '') || null,
    recommandations: String(donnees.get('recommandations') ?? ''),
  }
}

export async function actionOuvrirInvestigation(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const parcoursCode = await parcoursDuDossier(dossierId)

  if (!parcoursCode || !peutCreerInvestigation(utilisateur, { parcoursCode, enqueteurId: utilisateur.id })) {
    return { erreur: REFUS }
  }

  const dateBrute = String(donnees.get('dateOuverture') ?? '')
  const dateOuverture = dateBrute ? new Date(dateBrute) : new Date()

  if (Number.isNaN(dateOuverture.getTime())) {
    return { erreur: 'Merci d’indiquer une date d’ouverture valide.' }
  }

  try {
    await ouvrirInvestigation({
      dossierId,
      enqueteurId: utilisateur.id,
      dateOuverture,
      donnees: donneesDepuis(donnees),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Fiche d’investigation ouverte.' }
}

export async function actionMettreAJourInvestigation(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const investigationId = String(donnees.get('investigationId') ?? '')
  const contexte = await contexteInvestigation(investigationId)

  if (!contexte || !peutModifierInvestigation(utilisateur, contexte)) {
    return { erreur: REFUS }
  }

  try {
    await mettreAJourInvestigation({ investigationId, donnees: donneesDepuis(donnees) })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${contexte.dossierId}`)
  return { succes: 'Fiche mise à jour.' }
}

export async function actionSoumettreInvestigation(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const investigationId = String(donnees.get('investigationId') ?? '')
  const contexte = await contexteInvestigation(investigationId)

  // Soumettre relève de la modification : c'est l'enquêteur qui termine sa fiche.
  if (!contexte || !peutModifierInvestigation(utilisateur, contexte)) {
    return { erreur: REFUS }
  }

  try {
    await soumettrePourValidation(investigationId)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${contexte.dossierId}`)
  return { succes: 'Fiche soumise pour validation.' }
}

/** RGI-06 : la policy refuse déjà l'enquêteur lui-même, le service le revérifie. */
export async function actionValiderInvestigation(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const investigationId = String(donnees.get('investigationId') ?? '')
  const contexte = await contexteInvestigation(investigationId)

  if (!contexte || !peutValiderInvestigation(utilisateur, contexte)) {
    return { erreur: REFUS }
  }

  try {
    await validerInvestigation({ investigationId, validateurId: utilisateur.id })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${contexte.dossierId}`)
  return { succes: 'Investigation validée.' }
}
