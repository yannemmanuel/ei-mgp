'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import {
  peutChangerStatutDossier,
  peutCloturerDossier,
  peutReaffecterDossier,
  peutReouvrirDossier,
  type ParcoursCode,
} from '@/server/authz'
import { reaffecter } from '@/server/services/dossier/affectation'
import { changerStatut, cloturer, rejeter, reouvrir, ErreurWorkflow } from '@/server/services/dossier/workflow'
import { STATUTS, type StatutCode } from '@/server/services/dossier/statuts'
import { basculerContentieux } from '@/server/services/rgpd/conservation'
import { aPermission } from '@/server/authz'

/**
 * Actions de gestion d'un dossier.
 *
 * CHAQUE action revérifie l'autorisation côté serveur au moment de l'exécution, même lorsque
 * l'interface a déjà masqué le bouton correspondant : masquer une commande n'est pas un
 * contrôle d'accès (docs/exigences-securite.md §2).
 */

export type EtatAction = { erreur?: string; succes?: string }

/** Charge le dossier avec ce qu'il faut pour évaluer les policies. */
async function dossierPourAutorisation(dossierId: string, lecteurId: bigint) {
  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      is_anonymous: true,
      declarant_user_id: true,
      parcours: { select: { code: true } },
      statuts_dossier: { select: { code: true } },
      // `dossiers.view.own` et le contrôle d'étape en dépendent : le statut et l'affectation du
      // lecteur sont chargés ici, jamais déduits côté appelant.
      dossier_affectations: { where: { user_id: lecteurId, actif: true }, select: { id: true }, take: 1 },
    },
  })

  if (!dossier) return null

  return {
    parcoursCode: dossier.parcours.code as ParcoursCode,
    statutCode: dossier.statuts_dossier.code as StatutCode,
    isAnonymous: dossier.is_anonymous,
    declarantUserId: dossier.declarant_user_id,
    estAffecteAuLecteur: dossier.dossier_affectations.length > 0,
  }
}

/** Message générique : ne jamais révéler qu'un dossier existe hors du périmètre autorisé. */
const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message

  console.error('Action dossier en échec', erreur)
  return "L'opération n'a pas pu aboutir. Aucune donnée n'a été perdue : vous pouvez réessayer."
}

export async function actionReaffecter(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const dossier = await dossierPourAutorisation(dossierId, utilisateur.id)

  if (!dossier || !peutReaffecterDossier(utilisateur, dossier)) {
    return { erreur: REFUS }
  }

  const nouvelUtilisateurId = String(donnees.get('nouvelUtilisateurId') ?? '')
  const motif = String(donnees.get('motif') ?? '')

  if (nouvelUtilisateurId === '') return { erreur: 'Merci de sélectionner un utilisateur.' }
  if (motif.trim().length < 5) return { erreur: 'Le motif doit contenir au moins 5 caractères.' }

  try {
    await reaffecter({
      dossierId,
      nouvelUtilisateurId: BigInt(nouvelUtilisateurId),
      effectueParId: utilisateur.id,
      motif,
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Dossier réaffecté.' }
}

export async function actionChangerStatut(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const dossier = await dossierPourAutorisation(dossierId, utilisateur.id)

  if (!dossier || !peutChangerStatutDossier(utilisateur, dossier)) {
    return { erreur: REFUS }
  }

  // Valide reellement la valeur au lieu de la caster : elle vient d'un formulaire et peut avoir
  // ete forgee. Un cast laisserait passer n'importe quelle chaine jusqu'au service.
  const versBrut = String(donnees.get('vers') ?? '')
  if (!(STATUTS as readonly string[]).includes(versBrut)) {
    return { erreur: 'Merci de sélectionner un statut valide.' }
  }
  const vers = versBrut as StatutCode

  try {
    await changerStatut({
      dossierId,
      vers,
      acteurId: utilisateur.id,
      commentaire: String(donnees.get('commentaire') ?? '') || null,
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Statut mis à jour.' }
}

export async function actionRejeter(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const dossier = await dossierPourAutorisation(dossierId, utilisateur.id)

  // Le rejet est une transition de statut : il relève de la même permission.
  if (!dossier || !peutChangerStatutDossier(utilisateur, dossier)) {
    return { erreur: REFUS }
  }

  try {
    await rejeter({
      dossierId,
      acteurId: utilisateur.id,
      motif: String(donnees.get('motif') ?? ''),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Dossier rejeté (non recevable).' }
}

export async function actionCloturer(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const dossier = await dossierPourAutorisation(dossierId, utilisateur.id)

  if (!dossier || !peutCloturerDossier(utilisateur, dossier)) {
    return { erreur: REFUS }
  }

  try {
    await cloturer({
      dossierId,
      acteurId: utilisateur.id,
      syntheseResolution: String(donnees.get('syntheseResolution') ?? ''),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Dossier clôturé.' }
}

/** RG-07 : réservé aux porteurs de `dossiers.reopen` — `service_mgp` et `dg` uniquement. */
export async function actionReouvrir(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')
  const dossier = await dossierPourAutorisation(dossierId, utilisateur.id)

  if (!dossier || !peutReouvrirDossier(utilisateur, dossier)) {
    return { erreur: REFUS }
  }

  try {
    await reouvrir({
      dossierId,
      acteurId: utilisateur.id,
      motif: String(donnees.get('motif') ?? ''),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath(`/dossiers/${dossierId}`)
  return { succes: 'Dossier réouvert.' }
}


/**
 * RG-11 : pose ou lève le blocage « contentieux », qui empêche l'anonymisation automatique.
 *
 * Réservé au DPO. C'est la seule exception prévue au cycle de conservation : un dossier ainsi
 * marqué est compté, jamais traité, par la tâche planifiée.
 */
export async function actionBasculerContentieux(
  _precedent: EtatAction,
  donnees: FormData
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur()
  const dossierId = String(donnees.get('dossierId') ?? '')

  if (!aPermission(utilisateur, 'rgpd.conservation.manage')) {
    return { erreur: REFUS }
  }

  const pourPolicy = await dossierPourAutorisation(dossierId, utilisateur.id)
  if (!pourPolicy) return { erreur: REFUS }

  let contentieux: boolean

  try {
    contentieux = await basculerContentieux(dossierId)
  } catch (erreur) {
    console.error('Bascule du blocage contentieux en échec', erreur)
    return { erreur: "L'opération n'a pas abouti. Vous pouvez réessayer." }
  }

  revalidatePath(`/dossiers/${dossierId}`)

  return {
    succes: contentieux
      ? 'Dossier marqué en contentieux : anonymisation automatique bloquée.'
      : 'Blocage contentieux levé.',
  }
}
