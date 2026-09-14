'use server'

import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { consommerInvitation } from '@/server/services/administration/invitation'

/**
 * Définition du mot de passe depuis un lien d'invitation.
 *
 * ⚠️ Le jeton vient du FORMULAIRE, pas d'une session : cette action est atteignable sans être
 * connecté, par construction. C'est `consommerInvitation()` qui fait foi — elle revérifie le
 * jeton, son expiration et son usage avant d'écrire quoi que ce soit. Rien ici ne présume que la
 * page a fait ce travail : elle est publique, et un appel direct ne passe pas par elle.
 */
export type EtatPremiereConnexion = {
  erreur?: string
  succes?: boolean
}

export async function actionDefinirMotDePasse(
  _precedent: EtatPremiereConnexion,
  donnees: FormData
): Promise<EtatPremiereConnexion> {
  const jeton = String(donnees.get('jeton') ?? '')

  if (jeton === '') {
    return { erreur: 'Lien incomplet. Reprenez celui reçu par e-mail, en entier.' }
  }

  try {
    await consommerInvitation({
      jeton,
      // Aucun `trim()` : une espace en tête ou en fin fait partie du mot de passe. La retirer
      // en silence rendrait impossible de se reconnecter avec ce qu'on croit avoir saisi.
      motDePasse: String(donnees.get('motDePasse') ?? ''),
      confirmation: String(donnees.get('confirmation') ?? ''),
    })

    return { succes: true }
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Première connexion en échec', erreur)
    return { erreur: "L'opération n'a pas abouti. Vous pouvez réessayer." }
  }
}
