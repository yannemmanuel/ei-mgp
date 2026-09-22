'use server'

import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  creerFamilleRisque,
  deplacerFamilleRisque,
  modifierFamilleRisque,
  modifierTypesQualifiants,
  supprimerFamilleRisque,
} from '@/server/services/administration/familles-risque'
import { revalidatePath } from 'next/cache'

export type EtatFamilles = { erreur?: string; succes?: string }

/**
 * Quels types de déclaration demandent une famille de risque.
 *
 * ⚠️ L'AUTORISATION EST REVÉRIFIÉE ICI, indépendamment de l'écran qui a rendu le formulaire. Une
 * Server Action est une route : la masquer ne la ferme pas, et ce geste change ce que voient tous
 * les traitants d'un type de déclaration.
 */
export async function actionModifierTypesQualifiants(
  _precedent: EtatFamilles,
  donnees: FormData
): Promise<EtatFamilles> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'referentiels.categories.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier ce paramétrage." }
  }

  /*
    Cases décochées : le navigateur ne les envoie pas. L'absence vaut « non » — c'est bien le sens
    voulu, la liste reçue décrit l'état complet du paramétrage.
  */
  const types = donnees.getAll('types').map((t) => String(t))

  try {
    await modifierTypesQualifiants(acteur, types)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification des types qualifiant une famille de risque en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  /*
    ⚠️ BIEN AU-DELÀ DE CET ÉCRAN. Le réglage commande la carte de qualification sur CHAQUE fiche
    du type, et la répartition du tableau de bord. Ne revalider que l'écran d'origine laisserait
    les traitants devant une carte que le serveur ne reconnaît plus.
  */
  revalidatePath('/administration/familles-risque')
  revalidatePath('/dossiers')
  revalidatePath('/dashboard')

  return {
    succes:
      types.length === 0
        ? 'Aucun type ne demande plus de famille de risque. La carte disparaît de toutes les fiches.'
        : `Enregistré pour ${types.length} type(s) de déclaration. Effet immédiat.`,
  }
}
/* ------------------------------------------------------------------------------------------- */
/* Le référentiel lui-même : créer, renommer, réordonner, supprimer.                            */
/* ------------------------------------------------------------------------------------------- */

/**
 * ⚠️ CHACUNE DE CES ACTIONS REVÉRIFIE LA PERMISSION.
 *
 * Une Server Action est une route : `exigerPermission()` dans la page ne ferme que l'écran, pas
 * l'appel. Ces quatre gestes changent ce que tous les traitants voient dans leur liste.
 */
async function acteurAutorise(): Promise<
  { ok: true; acteur: { id: bigint } } | { ok: false; erreur: EtatFamilles }
> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'referentiels.categories.manage')) {
    return { ok: false, erreur: { erreur: "Vous n'êtes pas autorisé à modifier ce référentiel." } }
  }

  return { ok: true, acteur }
}

function echec(contexte: string, erreur: unknown): EtatFamilles {
  if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

  console.error(`${contexte} en échec`, erreur)
  return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
}

/**
 * Tout ce qu'un changement de famille rend périmé.
 *
 * ⚠️ BIEN AU-DELÀ DE CET ÉCRAN : la liste alimente la carte de qualification de CHAQUE fiche d'un
 * type qualifiant, et la répartition du tableau de bord. Ne revalider que l'écran d'origine
 * laisserait les traitants devant une liste que le serveur ne reconnaît plus.
 */
function revaliderFamilles(): void {
  revalidatePath('/administration/familles-risque')
  revalidatePath('/dossiers')
  revalidatePath('/dashboard')
}

/** Créer ou renommer : l'identifiant vide désigne une création, comme dans tous les référentiels. */
export async function actionModifierFamille(
  _precedent: EtatFamilles,
  donnees: FormData
): Promise<EtatFamilles> {
  const autorisation = await acteurAutorise()
  if (!autorisation.ok) return autorisation.erreur

  const id = String(donnees.get('id') ?? '').trim()
  const libelle = String(donnees.get('libelle') ?? '')
  // ⚠️ « 1 », et non « on » : c'est la valeur que l'éditeur de référentiel donne à ses cases.
  // Lire « on » aurait rendu TOUTE famille inactive à l'enregistrement, sans message.
  const actif = donnees.get('actif') === '1'

  try {
    if (id === '') {
      await creerFamilleRisque(autorisation.acteur, { libelle, actif })
    } else {
      await modifierFamilleRisque(autorisation.acteur, BigInt(id), { libelle, actif })
    }
  } catch (erreur) {
    return echec('Enregistrement d’une famille de risque', erreur)
  }

  revaliderFamilles()

  return {
    succes:
      id === ''
        ? `« ${libelle.trim()} » a été ajoutée. Elle est proposée en dernier dans la liste.`
        : `« ${libelle.trim()} » a été enregistrée. Effet immédiat.`,
  }
}

export async function actionSupprimerFamille(
  _precedent: EtatFamilles,
  donnees: FormData
): Promise<EtatFamilles> {
  const autorisation = await acteurAutorise()
  if (!autorisation.ok) return autorisation.erreur

  const id = String(donnees.get('id') ?? '').trim()

  if (id === '') return { erreur: 'Famille manquante.' }

  try {
    await supprimerFamilleRisque(autorisation.acteur, BigInt(id))
  } catch (erreur) {
    return echec('Suppression d’une famille de risque', erreur)
  }

  revaliderFamilles()
  return { succes: 'La famille a été supprimée.' }
}

export async function actionDeplacerFamille(
  _precedent: EtatFamilles,
  donnees: FormData
): Promise<EtatFamilles> {
  const autorisation = await acteurAutorise()
  if (!autorisation.ok) return autorisation.erreur

  const id = String(donnees.get('id') ?? '').trim()
  const sens = String(donnees.get('sens') ?? '')

  if (id === '') return { erreur: 'Famille manquante.' }
  if (sens !== 'monter' && sens !== 'descendre') return { erreur: 'Sens de déplacement inconnu.' }

  try {
    await deplacerFamilleRisque(autorisation.acteur, BigInt(id), sens)
  } catch (erreur) {
    return echec('Déplacement d’une famille de risque', erreur)
  }

  revaliderFamilles()
  return { succes: 'L’ordre a été enregistré.' }
}
