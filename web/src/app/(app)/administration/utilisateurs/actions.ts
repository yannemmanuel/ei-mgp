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
import { creerInvitation } from '@/server/services/administration/invitation'
import { configurationSmtp } from '@/server/services/notification/transport'

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
  /**
   * Le compte a été ouvert par LIEN : aucun mot de passe n'existe, et il n'y a donc rien à
   * transmettre. `motDePasseInitial` est alors absent — c'est ce qui distingue les deux voies à
   * l'écran.
   */
  parInvitation?: boolean
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
    /*
      Deux voies d'ouverture, et le transport tranche.

      AVEC messagerie : le compte naît SANS mot de passe et reçoit un lien à usage unique. Aucun
      secret ne transite, aucun ne s'affiche, et l'administrateur lui-même n'en connaît aucun.

      SANS messagerie : on retombe sur le mot de passe généré, montré une fois et remis en main
      propre. ⚠️ Ce repli n'est pas une commodité : sans lui, un compte créé alors qu'aucun SMTP
      n'est branché serait définitivement inaccessible — pas de mot de passe, et un lien que
      personne ne recevrait jamais.

      Le choix est fait AVANT la création, pas après : créer d'abord puis constater l'absence de
      transport laisserait un compte sans porte, qu'il faudrait rattraper par une seconde
      écriture.
    */
    const parInvitation = configurationSmtp() !== null
    const creation = identifiant(donnees, 'id') === null

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
      identifiant(donnees, 'id') ?? undefined,
      { sansMotDePasse: creation && parInvitation }
    )

    revalidatePath('/administration/utilisateurs')

    if (!creation) {
      return { succes: 'Compte mis à jour.' }
    }

    if (!parInvitation) {
      // Aucun transport : le mot de passe généré est la seule porte, et l'écran le montre.
      return {
        succes: 'Compte créé.',
        motDePasseInitial: resultat.motDePasseInitial ?? undefined,
        courriel: 'sans_transport',
      }
    }

    /*
      L'envoi part APRÈS l'enregistrement, et son échec ne le remet pas en cause.

      Le compte existe déjà. Laisser une panne SMTP ressortir en erreur ferait croire à
      l'administrateur que la création a échoué : il recommencerait et se heurterait au doublon
      d'adresse.

      ⚠️ EN CAS D'ÉCHEC, on bascule sur un mot de passe, immédiatement.

      Le compte naîtrait sinon sans mot de passe ET sans lien reçu : inaccessible, et il faudrait
      s'en apercevoir. Le cas n'a rien de théorique — il suffit d'un hôte mal orthographié dans
      la configuration pour que chaque création produise un compte mort-né.

      Deux portes ? Non : un envoi en ÉCHEC n'a atteint personne. Le lien existe en base mais
      n'est arrivé nulle part, et `regenererMotDePasse()` l'expire au passage. C'est la
      différence avec un envoi ACCEPTÉ puis perdu — là, le lien circule peut-être, et fabriquer
      un second accès en ouvrirait réellement deux.
    */
    const jeton = await creerInvitation(resultat.utilisateurId)

    const envoi = await envoyerIdentifiants({
      utilisateurId: resultat.utilisateurId,
      acteurId: acteur.id,
      nom,
      email,
      jeton,
    })

    if (envoi.etat === 'echec') {
      const secours = await regenererMotDePasse(acteur, resultat.utilisateurId)

      return {
        succes: 'Compte créé.',
        motDePasseInitial: secours,
        // `parInvitation` reste VRAI : c'est ce qui déclenche la bannière expliquant que l'envoi
        // a échoué. Sans elle, l'écran montrerait un mot de passe sans dire pourquoi, alors qu'un
        // lien était attendu.
        parInvitation: true,
        courriel: 'echec',
      }
    }

    return { succes: 'Compte créé.', parInvitation: true, courriel: envoi.etat }
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
