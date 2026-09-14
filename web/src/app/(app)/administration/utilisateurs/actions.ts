'use server'

import { revalidatePath } from 'next/cache'
import { utilisateurCourant } from '@/server/auth'
import { aPermission } from '@/server/authz'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  enregistrerUtilisateur,
  regenererMotDePasse,
} from '@/server/services/administration/utilisateurs'
import { envoyerIdentifiants } from '@/server/services/administration/courriel-identifiants'

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
  /**
   * Ce qu'il est advenu du courriel d'identifiants.
   *
   * ⚠️ Trois états, pas deux. « Non expédié » n'est pas « échec » : sans SMTP configuré, on
   * s'abstient délibérément plutôt que de replier sur un transport qui recopierait le mot de
   * passe dans les traces. Les confondre ferait chercher une panne là où il n'y en a pas.
   */
  courriel?: 'expedie' | 'sans_transport' | 'echec'
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

  // Même principe pour les parcours confiés. Le service les confronte au référentiel fermé des 4
  // codes : une case ajoutée à la main dans le navigateur n'ouvre aucun accès.
  const parcours = donnees.getAll('parcours').map((p) => String(p))

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
        parcours,
      },
      identifiant(donnees, 'id') ?? undefined
    )

    revalidatePath('/administration/utilisateurs')

    if (resultat.motDePasseInitial === null) {
      return { succes: 'Compte mis à jour.' }
    }

    /*
      Le courriel part APRÈS l'enregistrement, et son échec ne le remet pas en cause.

      Le compte existe déjà quand on arrive ici. Laisser une panne SMTP ressortir en erreur
      ferait croire à l'administrateur que la création a échoué : il recommencerait, se
      heurterait au doublon d'adresse, et perdrait le mot de passe affiché au passage.

      ⚠️ Le mot de passe reste montré à l'écran MÊME quand l'envoi réussit. Un courriel peut
      être rejeté en silence par le serveur d'en face, ou atterrir dans les indésirables ; le
      retirer de l'écran dès que le SMTP a dit « accepté » laisserait l'administrateur sans
      recours, devant un compte inaccessible dont plus personne ne connaît le secret.
    */
    const envoi = await envoyerIdentifiants({
      utilisateurId: resultat.utilisateurId,
      acteurId: acteur.id,
      nom,
      email,
      motDePasse: resultat.motDePasseInitial,
    })

    return {
      succes: 'Compte créé.',
      motDePasseInitial: resultat.motDePasseInitial,
      courriel: envoi.etat,
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
