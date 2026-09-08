'use server'

import { redirect } from 'next/navigation'
import { exigerUtilisateur } from '@/server/auth'
import { changerMotDePasse } from '@/server/auth/mot-de-passe'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'

export type EtatMotDePasse = { erreur?: string }

/**
 * Changement de mot de passe par son porteur.
 *
 * `exigerUtilisateur()` est refait ici, et pas seulement dans la page : une Server Action est une
 * entrée réseau à part entière, atteignable sans jamais afficher l'écran.
 *
 * Le compte visé est TOUJOURS celui de la session — jamais un identifiant reçu du formulaire.
 * Accepter une cible de l'extérieur ferait de cet écran un moyen de s'emparer du compte d'autrui,
 * quelle que soit la vérification qui l'accompagnerait.
 */
export async function actionChangerMotDePasse(
  _precedent: EtatMotDePasse,
  donnees: FormData
): Promise<EtatMotDePasse> {
  const utilisateur = await exigerUtilisateur()

  try {
    await changerMotDePasse({
      utilisateurId: utilisateur.id,
      actuel: String(donnees.get('actuel') ?? ''),
      nouveau: String(donnees.get('nouveau') ?? ''),
      confirmation: String(donnees.get('confirmation') ?? ''),
    })
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Changement de mot de passe en échec', erreur)
    return { erreur: 'L’enregistrement n’a pas abouti. Vous pouvez réessayer.' }
  }

  // Hors du `try` : `redirect()` lève une exception que Next intercepte, et la rattraper ici
  // transformerait une redirection réussie en message d'échec.
  redirect('/dashboard')
}
