'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission, type Permission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  supprimerCanalCaptage,
  supprimerCompte,
  supprimerDirection,
  supprimerGabarit,
  supprimerNiveauGravite,
  supprimerQrCode,
  supprimerSite,
  supprimerStatut,
} from '@/server/services/administration/suppression'

/**
 * Les suppressions du back-office qui n'existaient pas.
 *
 * ⚠️ Dans un module à part, et non dans `administration/actions.ts` : ce fichier-là est en cours
 * de modification par ailleurs, et y ajouter huit actions aurait garanti un conflit. La frontière
 * est de toute façon lisible — tout ce qui EFFACE est ici, et s'y relit d'un coup d'œil.
 *
 * Chaque action ne fait que trois choses : vérifier le droit, appeler le service, rafraîchir
 * l'écran. La règle de suppression — ce qu'on refuse, et pourquoi — vit dans
 * `services/administration/suppression.ts`, où elle est testée. Une Server Action ne décide de
 * rien : elle est atteignable directement, et ce qui s'y déciderait ne serait vérifié nulle part.
 */

export type EtatSuppression = {
  erreur?: string
  succes?: string
}

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

async function acteurAutorise(permission: Permission) {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur || !aPermission(utilisateur, permission)) return null

  return utilisateur
}

/**
 * ⚠️ Un `ErreurWorkflow` est RENDU tel quel : c'est le message qui nomme ce qui s'oppose à la
 * suppression et propose la désactivation. Le remplacer par un générique retirerait au refus la
 * moitié qui sert.
 */
function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message

  console.error('Suppression en échec', erreur)
  return "La suppression n'a pas abouti. Vous pouvez réessayer."
}

function identifiant(donnees: FormData): bigint | undefined {
  const brut = String(donnees.get('id') ?? '').trim()
  return brut === '' ? undefined : BigInt(brut)
}

/**
 * Fabrique une action de suppression.
 *
 * Les huit ne diffèrent que par leur droit, leur service, leur écran et leur message. Les écrire
 * à la main huit fois aurait multiplié par huit le risque d'oublier la vérification de droit —
 * qui est la seule ligne qui compte vraiment ici.
 */
function actionDeSuppression<Id extends bigint | string>(config: {
  permission: Permission
  supprimer: (acteur: { id: bigint }, id: Id) => Promise<void>
  lireId: (donnees: FormData) => Id | undefined
  chemin: string
  introuvable: string
  succes: string
}) {
  return async function supprimer(
    _precedent: EtatSuppression,
    donnees: FormData
  ): Promise<EtatSuppression> {
    const acteur = await acteurAutorise(config.permission)
    if (!acteur) return { erreur: REFUS }

    const id = config.lireId(donnees)
    if (id === undefined) return { erreur: config.introuvable }

    try {
      await config.supprimer(acteur, id)
    } catch (erreur) {
      return { erreur: messageErreur(erreur) }
    }

    revalidatePath(config.chemin)
    return { succes: config.succes }
  }
}

export const actionSupprimerCanal = actionDeSuppression({
  permission: 'canaux.manage',
  supprimer: supprimerCanalCaptage,
  lireId: identifiant,
  chemin: '/administration/canaux',
  introuvable: 'Canal introuvable.',
  succes: 'Canal supprimé.',
})

export const actionSupprimerGravite = actionDeSuppression({
  permission: 'referentiels.gravites.manage',
  supprimer: supprimerNiveauGravite,
  lireId: identifiant,
  chemin: '/administration/gravites',
  introuvable: 'Niveau introuvable.',
  succes: 'Niveau de gravité supprimé.',
})

export const actionSupprimerSite = actionDeSuppression({
  permission: 'referentiels.sites.manage',
  supprimer: supprimerSite,
  lireId: identifiant,
  chemin: '/administration/organisation',
  introuvable: 'Site introuvable.',
  succes: 'Site supprimé.',
})

export const actionSupprimerDirection = actionDeSuppression({
  permission: 'referentiels.sites.manage',
  supprimer: supprimerDirection,
  lireId: identifiant,
  chemin: '/administration/organisation',
  introuvable: 'Direction introuvable.',
  succes: 'Direction supprimée.',
})

export const actionSupprimerGabarit = actionDeSuppression({
  permission: 'notifications.templates.manage',
  supprimer: supprimerGabarit,
  lireId: identifiant,
  chemin: '/administration/notifications',
  introuvable: 'Modèle introuvable.',
  succes: 'Modèle supprimé. ⚠️ Plus aucun message ne partira pour cet évènement.',
})

export const actionSupprimerQrCode = actionDeSuppression({
  permission: 'qrcodes.manage',
  supprimer: supprimerQrCode,
  // Un QR code porte un ULID, pas un entier : il voyage donc en texte.
  lireId: (donnees) => String(donnees.get('id') ?? '').trim() || undefined,
  chemin: '/administration/qr-codes',
  introuvable: 'QR code introuvable.',
  succes: 'QR code supprimé.',
})

export const actionSupprimerStatut = actionDeSuppression({
  permission: 'referentiels.statuts.manage',
  supprimer: supprimerStatut,
  lireId: identifiant,
  chemin: '/administration/statuts',
  introuvable: 'Statut introuvable.',
  succes: 'Statut supprimé.',
})

export const actionSupprimerCompte = actionDeSuppression({
  permission: 'users.manage',
  supprimer: supprimerCompte,
  lireId: identifiant,
  chemin: '/administration/utilisateurs',
  introuvable: 'Compte introuvable.',
  succes: 'Compte supprimé.',
})
