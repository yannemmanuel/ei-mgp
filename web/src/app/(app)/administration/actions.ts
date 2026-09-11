'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission, type Permission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  CANAUX_NOTIFICATION,
  enregistrerCategorie,
  enregistrerListePlate,
  type ListePlate,
  enregistrerPoste,
  enregistrerGabarit,
  enregistrerDirection,
  enregistrerSite,
  rattacherDirection,
  modifierCanal,
  modifierStatut,
  type CanalNotification,
} from '@/server/services/administration/referentiels'
import {
  creerDelai,
  ETAPES_DELAI,
  modifierDelai,
  UNITES_DELAI,
  type UniteDelai,
} from '@/server/services/administration/delais'
import type { EtapeDelai } from '@/server/services/dossier/delais'
import {
  EFFETS_CIRCUIT,
  modifierGravite,
  type EffetCircuit,
} from '@/server/services/administration/gravites'
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

  revalidatePath('/administration/organisation')
  return { succes: 'Site enregistré.' }
}

/**
 * Enregistrement d'une direction, avec son site de rattachement.
 *
 * Partage la permission `referentiels.sites.manage` : sites et directions décrivent la même
 * organisation, et ouvrir une permission de plus pour la moitié d'un référentiel compliquerait la
 * matrice sans rien protéger de plus.
 */
export async function actionEnregistrerDirection(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.sites.manage')
  if (!acteur) return { erreur: REFUS }

  if (texte(donnees, 'code') === '' || texte(donnees, 'libelle') === '') {
    return { erreur: 'Code et libellé sont obligatoires.' }
  }

  const site = texte(donnees, 'siteId')

  try {
    await enregistrerDirection(
      acteur,
      {
        code: texte(donnees, 'code'),
        libelle: texte(donnees, 'libelle'),
        siteId: site === '' ? null : BigInt(site),
        actif: coche(donnees, 'actif'),
      },
      identifiant(donnees)
    )
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/organisation')
  return { succes: 'Direction enregistrée.' }
}

/**
 * Rattachement d'une direction à un site, ou détachement.
 *
 * Le geste d'affectation, isolé de l'édition : il se déclenche depuis la liste, sans ouvrir de
 * formulaire, parce que déplacer vingt directions ne doit pas demander vingt formulaires.
 */
export async function actionRattacherDirection(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.sites.manage')
  if (!acteur) return { erreur: REFUS }

  const direction = texte(donnees, 'directionId')
  if (direction === '') return { erreur: 'Direction manquante.' }

  const site = texte(donnees, 'siteId')

  try {
    await rattacherDirection(acteur, BigInt(direction), site === '' ? null : BigInt(site))
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/organisation')
  return { succes: site === '' ? 'Direction détachée.' : 'Direction rattachée.' }
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

export async function actionModifierDelai(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.delais.manage')
  if (!acteur) return { erreur: REFUS }

  const unite = texte(donnees, 'unite')

  if (!UNITES_DELAI.includes(unite as UniteDelai)) {
    return { erreur: 'Unité de délai inconnue.' }
  }

  const valeurs = {
    valeur: entier(donnees, 'valeur', 0),
    unite: unite as UniteDelai,
    estValideMetier: coche(donnees, 'estValideMetier'),
    notes: texte(donnees, 'notes') || null,
  }

  const delaiId = identifiant(donnees)

  try {
    if (delaiId === undefined) {
      // Création : comble un couple (parcours, étape) que le seeder n'avait pas prévu.
      const parcoursId = texte(donnees, 'parcoursId')
      const etape = texte(donnees, 'etapeCode')

      if (parcoursId === '' || !ETAPES_DELAI.includes(etape as EtapeDelai)) {
        return { erreur: 'Merci de choisir un parcours et une étape.' }
      }

      await creerDelai(acteur, BigInt(parcoursId), etape as EtapeDelai, valeurs)
    } else {
      await modifierDelai(acteur, delaiId, valeurs)
    }
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/delais')
  return { succes: 'Délai enregistré.' }
}

export async function actionModifierGravite(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.gravites.manage')
  if (!acteur) return { erreur: REFUS }

  const graviteId = identifiant(donnees)
  if (graviteId === undefined) return { erreur: 'Niveau de gravité introuvable.' }

  const effet = texte(donnees, 'effetCircuit')

  if (!EFFETS_CIRCUIT.includes(effet as EffetCircuit)) {
    return { erreur: 'Effet de circuit inconnu.' }
  }

  try {
    await modifierGravite(acteur, graviteId, {
      libelle: texte(donnees, 'libelle'),
      couleur: texte(donnees, 'couleur') || null,
      effetCircuit: effet as EffetCircuit,
      actif: coche(donnees, 'actif'),
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/gravites')
  return { succes: 'Niveau de gravité enregistré.' }
}

/**
 * Postes rattachés à une direction (ADM2).
 *
 * Le droit exigé est celui des sites et directions : un poste est une subdivision de
 * l'organisation, et non une nomenclature de formulaire. Qui administre les directions
 * administre leurs postes.
 */
export async function actionEnregistrerPoste(
  _precedent: EtatFormulaire,
  donnees: FormData
): Promise<EtatFormulaire> {
  const acteur = await acteurAutorise('referentiels.sites.manage')
  if (!acteur) return { erreur: REFUS }

  const directionId = texte(donnees, 'directionId')

  if (directionId === '' || texte(donnees, 'libelle') === '') {
    return { erreur: 'Direction et libellé sont obligatoires.' }
  }

  try {
    await enregistrerPoste(
      acteur,
      {
        directionId: BigInt(directionId),
        libelle: texte(donnees, 'libelle'),
        ordre: entier(donnees, 'ordre', 1),
        actif: coche(donnees, 'actif'),
      },
      identifiant(donnees)
    )
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/administration/postes')
  return { succes: 'Poste enregistré.' }
}

/**
 * Lieux, villes et tranches d'ancienneté (ADM3, ADM4, ADM5).
 *
 * Une seule action paramétrée par la liste visée : trois actions identiques à la ligne près
 * auraient divergé au premier ajustement.
 */
function actionListePlate(liste: ListePlate, succes: string) {
  return async function enregistrer(
    _precedent: EtatFormulaire,
    donnees: FormData
  ): Promise<EtatFormulaire> {
    const acteur = await acteurAutorise('referentiels.categories.manage')
    if (!acteur) return { erreur: REFUS }

    if (texte(donnees, 'libelle') === '') {
      return { erreur: 'Le libellé est obligatoire.' }
    }

    try {
      await enregistrerListePlate(
        acteur,
        liste,
        {
          libelle: texte(donnees, 'libelle'),
          ordre: entier(donnees, 'ordre', 1),
          actif: coche(donnees, 'actif'),
        },
        identifiant(donnees)
      )
    } catch (erreur) {
      return { erreur: messageErreur(erreur) }
    }

    revalidatePath('/administration/listes-formulaires')
    return { succes }
  }
}

export const actionEnregistrerLieu = actionListePlate('lieu', 'Lieu enregistré.')
export const actionEnregistrerVille = actionListePlate('ville', 'Ville enregistrée.')
export const actionEnregistrerTranche = actionListePlate(
  'trancheAnciennete',
  'Tranche enregistrée.'
)
