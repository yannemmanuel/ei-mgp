'use server'

import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { modifierTypesQualifiants } from '@/server/services/administration/familles-risque'
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
