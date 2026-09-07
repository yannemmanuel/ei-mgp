'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  enregistrerUtilisateur,
  regenererMotDePasse,
} from '@/server/services/administration/utilisateurs'

/**
 * Console des comptes.
 *
 * Le mot de passe initial généré est renvoyé UNE fois, dans l'état de l'action, et n'est jamais
 * persisté en clair : ni en base, ni dans le journal d'audit, ni dans les traces serveur.
 */
export type EtatCompte = {
  erreur?: string
  succes?: string
  motDePasseInitial?: string
}

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action."

const texte = (donnees: FormData, cle: string): string => String(donnees.get(cle) ?? '').trim()

function identifiant(donnees: FormData, cle: string): bigint | null {
  const brut = texte(donnees, cle)
  return brut === '' ? null : BigInt(brut)
}

export async function actionEnregistrerCompte(
  _precedent: EtatCompte,
  donnees: FormData
): Promise<EtatCompte> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'users.manage')) {
    return { erreur: REFUS }
  }

  const nom = texte(donnees, 'name')
  const email = texte(donnees, 'email')

  if (nom === '' || email === '') {
    return { erreur: 'Le nom et l’adresse e-mail sont obligatoires.' }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erreur: 'Adresse e-mail invalide.' }
  }

  // Les rôles arrivent en cases multiples : la liste est reconstituée, puis filtrée côté service
  // contre les rôles réellement existants — un nom fabriqué ne peut pas être attribué.
  const roles = donnees.getAll('roles').map((r) => String(r))

  try {
    const resultat = await enregistrerUtilisateur(
      acteur,
      {
        name: nom,
        email,
        matricule: texte(donnees, 'matricule') || null,
        poste: texte(donnees, 'poste') || null,
        directionId: identifiant(donnees, 'directionId'),
        siteId: identifiant(donnees, 'siteId'),
        responsableHierarchiqueId: identifiant(donnees, 'responsableHierarchiqueId'),
        actif: donnees.get('actif') === '1',
        roles,
      },
      identifiant(donnees, 'id') ?? undefined
    )

    revalidatePath('/administration/utilisateurs')

    return resultat.motDePasseInitial === null
      ? { succes: 'Compte mis à jour.' }
      : {
          succes: 'Compte créé.',
          motDePasseInitial: resultat.motDePasseInitial,
        }
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Enregistrement de compte en échec', erreur)
    return { erreur: "L'enregistrement n'a pas abouti. Vous pouvez réessayer." }
  }
}

/**
 * Réattribue un mot de passe à un compte dont l'utilisateur a perdu le sien.
 *
 * Seule voie de récupération opérationnelle aujourd'hui : le parcours en libre-service de
 * Laravel est inatteignable (aucune vue enregistrée) et exigerait de toute façon un transport
 * e-mail, qui n'est pas branché.
 */
export async function actionRegenererMotDePasse(
  _precedent: EtatCompte,
  donnees: FormData
): Promise<EtatCompte> {
  const acteur = await utilisateurCourant()

  if (!acteur || !aPermission(acteur, 'users.manage')) {
    return { erreur: REFUS }
  }

  const cible = identifiant(donnees, 'id')
  if (cible === null) return { erreur: 'Compte introuvable.' }

  try {
    const motDePasse = await regenererMotDePasse(acteur, cible)

    revalidatePath('/administration/utilisateurs')

    return { succes: 'Nouveau mot de passe attribué.', motDePasseInitial: motDePasse }
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message }

    console.error('Régénération de mot de passe en échec', erreur)
    return { erreur: "L'opération n'a pas abouti. Vous pouvez réessayer." }
  }
}
