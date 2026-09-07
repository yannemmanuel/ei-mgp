'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission, type Permission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  CANAUX_NOTIFICATION,
  enregistrerCategorie,
  enregistrerGabarit,
  enregistrerSite,
  modifierCanal,
  modifierStatut,
  type CanalNotification,
} from '@/server/services/administration/referentiels'
import type { EtatFormulaire } from './editeur-referentiel'

/**
 * Actions d'administration des référentiels.
 *
 * Chaque action REVÉRIFIE sa permission au moment de l'exécution. Ni le masquage d'un lien de
 * navigation, ni la protection de la page qui affiche le formulaire ne constituent un contrôle :
 * une action serveur est une entrée réseau à part entière, appelable directement.
 */

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

/** Refuse tôt et de la même façon partout, plutôt que de dupliquer le test dans chaque action. */
async function acteurAutorise(permission: Permission) {
  const utilisateur = await utilisateurCourant()

  if (!utilisateur || !aPermission(utilisateur, permission)) return null

  return utilisateur
}

function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message

  console.error('Action d’administration en échec', erreur)
  return "L'enregistrement n'a pas abouti. Vous pouvez réessayer."
}

const texte = (donnees: FormData, cle: string): string => String(donnees.get(cle) ?? '').trim()
const coche = (donnees: FormData, cle: string): boolean => donnees.get(cle) === '1'

function identifiant(donnees: FormData, cle = 'id'): bigint | undefined {
  const brut = texte(donnees, cle)
  return brut === '' ? undefined : BigInt(brut)
}

function entier(donnees: FormData, cle: string, defaut: number): number {
  const valeur = Number(texte(donnees, cle))
  return Number.isFinite(valeur) ? valeur : defaut
}

export async function actionEnregistrerCategorie(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.categories.manage')
  if (!acteur) return { erreur: REFUS }

  const parcoursId = texte(donnees, 'parcoursId')

  if (parcoursId === '' || texte(donnees, 'code') === '' || texte(donnees, 'libelle') === '') {
    return { erreur: 'Parcours, code et libellé sont obligatoires.' }
  }

  try {
    await enregistrerCategorie(
      acteur,
      {
        parcoursId: BigInt(parcoursId),
        code: texte(donnees, 'code'),
        libelle: texte(donnees, 'libelle'),
        isAutre: coche(donnees, 'isAutre'),
        actif: coche(donnees, 'actif'),
        ordre: entier(donnees, 'ordre', 1),
      },
      identifiant(donnees)
    )
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/categories')
  return { succes: 'Catégorie enregistrée.' }
}

export async function actionModifierStatut(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.statuts.manage')
  if (!acteur) return { erreur: REFUS }

  const statutId = identifiant(donnees)
  if (statutId === undefined) return { erreur: 'Statut introuvable.' }

  if (texte(donnees, 'libelleInterne') === '' || texte(donnees, 'libelleAffiche') === '') {
    return { erreur: 'Les deux libellés sont obligatoires.' }
  }

  try {
    await modifierStatut(acteur, statutId, {
      libelleInterne: texte(donnees, 'libelleInterne'),
      libelleAffiche: texte(donnees, 'libelleAffiche'),
      ordre: entier(donnees, 'ordre', 1),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/statuts')
  return { succes: 'Statut mis à jour.' }
}

export async function actionEnregistrerSite(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.sites.manage')
  if (!acteur) return { erreur: REFUS }

  if (texte(donnees, 'code') === '' || texte(donnees, 'libelle') === '') {
    return { erreur: 'Code et libellé sont obligatoires.' }
  }

  try {
    await enregistrerSite(
      acteur,
      {
        code: texte(donnees, 'code'),
        libelle: texte(donnees, 'libelle'),
        actif: coche(donnees, 'actif'),
      },
      identifiant(donnees)
    )
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/sites')
  return { succes: 'Site enregistré.' }
}

export async function actionModifierCanal(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('canaux.manage')
  if (!acteur) return { erreur: REFUS }

  const canalId = identifiant(donnees)
  if (canalId === undefined) return { erreur: 'Canal introuvable.' }

  if (texte(donnees, 'libelle') === '') return { erreur: 'Le libellé est obligatoire.' }

  try {
    await modifierCanal(acteur, canalId, {
      libelle: texte(donnees, 'libelle'),
      actif: coche(donnees, 'actif'),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/canaux')
  return { succes: 'Canal mis à jour.' }
}

/** Une adresse invalide dans la liste ferait échouer l'envoi entier : filtré en amont. */
function adressesValides(brut: string): { adresses: string[]; invalides: string[] } {
  const adresses: string[] = []
  const invalides: string[] = []

  for (const morceau of brut.split(',')) {
    const adresse = morceau.trim()
    if (adresse === '') continue

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) adresses.push(adresse)
    else invalides.push(adresse)
  }

  return { adresses, invalides }
}

export async function actionEnregistrerGabarit(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('notifications.templates.manage')
  if (!acteur) return { erreur: REFUS }

  const canal = texte(donnees, 'canal')

  if (!CANAUX_NOTIFICATION.includes(canal as CanalNotification)) {
    return { erreur: 'Canal invalide.' }
  }

  if (
    texte(donnees, 'evenementCode') === '' ||
    texte(donnees, 'objet') === '' ||
    texte(donnees, 'corps') === ''
  ) {
    return { erreur: 'Code évènement, objet et corps sont obligatoires.' }
  }

  const { adresses, invalides } = adressesValides(texte(donnees, 'destinatairesSupplementaires'))

  if (invalides.length > 0) {
    return { erreur: `Adresse e-mail invalide : ${invalides.join(', ')}.` }
  }

  const parcoursId = texte(donnees, 'parcoursId')

  try {
    await enregistrerGabarit(
      acteur,
      {
        evenementCode: texte(donnees, 'evenementCode'),
        parcoursId: parcoursId === '' ? null : BigInt(parcoursId),
        canal: canal as CanalNotification,
        objet: texte(donnees, 'objet'),
        corps: texte(donnees, 'corps'),
        destinatairesSupplementaires: adresses,
        actif: coche(donnees, 'actif'),
      },
      identifiant(donnees)
    )
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/notifications')
  return { succes: 'Gabarit enregistré.' }
}
