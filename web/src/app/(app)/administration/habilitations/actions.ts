'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { modifierPermissionsRole } from '@/server/services/administration/habilitations'

/**
 * Modification des habilitations d'un rôle.
 *
 * L'effet est immédiat et global : les permissions sont relues en base à chaque requête. Une
 * erreur ici change ce que tout le monde peut faire, d'où la revérification d'autorisation et la
 * validation stricte côté service.
 */
export type EtatHabilitation = { erreur?: string; succes?: string }

export async function actionModifierHabilitations(
  _precedent: EtatHabilitation,
  donnees: FormData
): Promise<EtatHabilitation> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'roles.manage')) {
    return { erreur: "Vous n'êtes pas autorisé à modifier les habilitations." }
  }

  const role = String(donnees.get('role') ?? '').trim()

  if (role === '') return { erreur: 'Rôle manquant.' }

  // Cases décochées : le navigateur ne les envoie pas. L'absence vaut retrait — c'est bien le
  // sens voulu, la liste reçue décrit l'état complet du rôle.
  const permissions = donnees.getAll('permissions').map((p) => String(p))

  try {
    await modifierPermissionsRole(acteur, role, permissions)
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Modification des habilitations en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }

  revalidatePath('/administration/habilitations')
  return { succes: `Habilitations de « ${role} » enregistrées. Effet immédiat.` }
}
