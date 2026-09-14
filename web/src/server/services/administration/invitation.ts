import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hacher } from '@/server/auth/hachage'
import {
  LONGUEUR_MINIMALE,
  OCTETS_MAXIMUM,
  longueurEnOctets,
} from '@/server/auth/mot-de-passe'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser } from '../audit/journal'

/**
 * Lien de première connexion à usage unique.
 *
 * Remplace l'envoi du mot de passe lui-même. Le message ne porte plus de secret exploitable : il
 * porte une adresse qui, une fois, ouvre un écran où la personne choisit un mot de passe que
 * personne d'autre n'aura connu — ni l'administrateur, ni quiconque aurait lu le courriel.
 *
 * ⚠️ Le compte invité est créé SANS mot de passe (`users.password` à NULL, colonne nullable depuis
 * DT-01). Ce n'est pas un compte ouvert : `verifierIdentifiants()` refuse tout mot de passe sur un
 * compte sans empreinte, et le fait déjà en temps constant. Le lien est donc la SEULE porte, et
 * elle se referme derrière celui qui la franchit.
 */

/**
 * Validité du lien, en heures.
 *
 * Trois jours, et non l'heure d'un lien de réinitialisation. Ce lien n'est pas déclenché par la
 * personne : il arrive sans qu'elle l'ait demandé, souvent un vendredi soir ou pendant un congé.
 * Une heure garantirait qu'une large part expire avant d'être lue, et chaque expiration se paie
 * d'un aller-retour avec l'administration. Trois jours reste court devant la durée de vie d'un
 * compte, et la fenêtre se referme de toute façon à la première utilisation.
 */
export const VALIDITE_HEURES = 72

/** Longueur du tirage, en octets. 32 octets = 256 bits : hors de portée d'une recherche. */
const OCTETS_JETON = 32

function empreinte(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex')
}

/**
 * Émet un lien pour ce compte, et invalide les précédents.
 *
 * ⚠️ Les invitations antérieures encore ouvertes sont EXPIRÉES, pas supprimées. Réémettre doit
 * couper l'ancien lien : sans cela, un courriel égaré resterait une porte ouverte pendant trois
 * jours, et réémettre — le geste même qu'on fait quand on craint qu'un message se soit perdu —
 * multiplierait les clés au lieu de les remplacer.
 *
 * Renvoie le jeton EN CLAIR. C'est la seule et unique fois qu'il existe sous cette forme : la base
 * n'en garde que l'empreinte.
 */
export async function creerInvitation(utilisateurId: bigint): Promise<string> {
  const jeton = randomBytes(OCTETS_JETON).toString('base64url')
  const maintenant = new Date()

  /*
    ⚠️ Une seconde EN ARRIÈRE, et non « maintenant ».

    `expire_le` est un `TIMESTAMP(0)` : Postgres arrondit à la seconde la PLUS PROCHE, pas vers le
    bas. Écrire 10:00:00.700 y range 10:00:01 — un instant encore à venir. Poser l'échéance à
    `maintenant` laissait donc l'ancien lien valide jusqu'à une demi-seconde de plus, ce qui n'est
    pas long mais suffit à ce que la coupure ne soit pas la garantie qu'on croit tenir.

    Reculer d'une seconde place le résultat dans le passé quel que soit l'arrondi.
  */
  await prisma.invitations_connexion.updateMany({
    where: { user_id: utilisateurId, utilise_le: null, expire_le: { gt: maintenant } },
    data: { expire_le: new Date(maintenant.getTime() - 1000), updated_at: maintenant },
  })

  await prisma.invitations_connexion.create({
    data: {
      user_id: utilisateurId,
      token_hash: empreinte(jeton),
      expire_le: new Date(maintenant.getTime() + VALIDITE_HEURES * 3_600_000),
      created_at: maintenant,
      updated_at: maintenant,
    },
  })

  return jeton
}

export type EtatInvitation =
  | { readonly etat: 'valide'; readonly nom: string; readonly email: string }
  /** Le lien a servi. Distinct d'« inconnu » : la personne a déjà son mot de passe. */
  | { readonly etat: 'deja_utilise' }
  | { readonly etat: 'expire' }
  /** Jeton inconnu, ou compte désactivé depuis l'envoi. */
  | { readonly etat: 'invalide' }

type LigneInvitation = {
  id: bigint
  user_id: bigint
  expire_le: Date
  utilise_le: Date | null
  users: { name: string; email: string; actif: boolean }
}

async function retrouver(jeton: string): Promise<LigneInvitation | null> {
  // Recherche par empreinte : le jeton en clair ne touche jamais la base, et l'index unique
  // évite de parcourir la table — ce qu'imposerait un hachage salé, non reproductible.
  const attendue = empreinte(jeton)

  const ligne = await prisma.invitations_connexion.findUnique({
    where: { token_hash: attendue },
    select: {
      id: true,
      user_id: true,
      expire_le: true,
      utilise_le: true,
      token_hash: true,
      users: { select: { name: true, email: true, actif: true } },
    },
  })

  if (!ligne) return null

  /*
    Comparaison à temps constant, bien que l'index ait déjà tranché.

    L'égalité est acquise — Postgres a comparé pour nous. Ce rappel garde la propriété si la
    recherche devenait un jour un parcours (jeton tronqué, préfixe, migration d'index) : la
    dernière comparaison serait alors la seule, et une comparaison naïve y révèlerait le secret
    caractère par caractère.
  */
  const a = Buffer.from(ligne.token_hash, 'utf8')
  const b = Buffer.from(attendue, 'utf8')

  return a.length === b.length && timingSafeEqual(a, b) ? ligne : null
}

/** Ce que vaut ce lien, sans rien y changer — pour l'affichage de l'écran. */
export async function verifierInvitation(jeton: string): Promise<EtatInvitation> {
  const ligne = await retrouver(jeton)

  if (!ligne || !ligne.users.actif) return { etat: 'invalide' }
  if (ligne.utilise_le !== null) return { etat: 'deja_utilise' }
  if (ligne.expire_le <= new Date()) return { etat: 'expire' }

  return { etat: 'valide', nom: ligne.users.name, email: ligne.users.email }
}

/**
 * Consomme le lien et fixe le mot de passe choisi.
 *
 * ⚠️ Les deux écritures sont dans UNE transaction, et la consommation est conditionnée à
 * `utilise_le: null`. Deux soumissions simultanées — un double-clic, un navigateur qui rejoue la
 * requête — ne peuvent donc pas fixer deux mots de passe successifs : la seconde ne trouve plus de
 * ligne à marquer et échoue avant d'écrire quoi que ce soit.
 */
export async function consommerInvitation(params: {
  jeton: string
  motDePasse: string
  confirmation: string
}): Promise<{ utilisateurId: bigint }> {
  if (params.motDePasse !== params.confirmation) {
    throw new ErreurWorkflow('Les deux saisies ne correspondent pas.')
  }

  // Mêmes règles que le changement de mot de passe ordinaire, lues au même endroit : deux barèmes
  // divergents laisseraient choisir ici ce que l'autre écran refuse ensuite.
  if (params.motDePasse.length < LONGUEUR_MINIMALE) {
    throw new ErreurWorkflow(
      `Le mot de passe doit compter au moins ${LONGUEUR_MINIMALE} caractères.`
    )
  }

  if (longueurEnOctets(params.motDePasse) > OCTETS_MAXIMUM) {
    throw new ErreurWorkflow(
      `Le mot de passe est trop long (${OCTETS_MAXIMUM} octets au maximum). Les accents et emojis comptent pour plusieurs octets.`
    )
  }

  const etat = await verifierInvitation(params.jeton)

  if (etat.etat !== 'valide') {
    throw new ErreurWorkflow(MESSAGES[etat.etat])
  }

  const ligne = await retrouver(params.jeton)
  if (!ligne) throw new ErreurWorkflow(MESSAGES.invalide)

  const empreinteMotDePasse = await hacher(params.motDePasse)

  await prisma.$transaction(async (tx) => {
    const consommee = await tx.invitations_connexion.updateMany({
      where: { id: ligne.id, utilise_le: null },
      data: { utilise_le: new Date(), updated_at: new Date() },
    })

    // Zéro ligne touchée : quelqu'un d'autre a consommé le lien entre la vérification et ici.
    if (consommee.count === 0) {
      throw new ErreurWorkflow(MESSAGES.deja_utilise)
    }

    await tx.users.update({
      where: { id: ligne.user_id },
      data: {
        password: empreinteMotDePasse,
        // La personne vient de choisir sa valeur : plus rien à lui imposer au prochain écran.
        doit_changer_mot_de_passe: false,
        updated_at: new Date(),
      },
    })
  })

  await journaliser({
    action: 'user.premiere_connexion',
    // L'acteur est le porteur du compte : c'est LUI qui agit, pas l'administrateur qui a invité.
    acteurId: ligne.user_id,
    auditableType: MODELES.utilisateur,
    auditableId: String(ligne.user_id),
    // Ni la valeur ni son empreinte : seul le fait que le compte a été pris en main.
    nouvelles: { premiere_connexion: true },
  })

  return { utilisateurId: ligne.user_id }
}

/** Ce qu'on dit à qui arrive avec un lien qui ne marche pas. Jamais « erreur ». */
export const MESSAGES: Record<Exclude<EtatInvitation['etat'], 'valide'>, string> = {
  deja_utilise:
    'Ce lien a déjà servi à définir un mot de passe. Connectez-vous avec celui que vous avez choisi ; si vous l’avez oublié, demandez un nouveau lien à votre administrateur.',
  expire: `Ce lien a expiré (il est valable ${VALIDITE_HEURES} heures). Demandez-en un nouveau à votre administrateur.`,
  invalide:
    'Ce lien n’est pas valide. Vérifiez que vous l’avez copié en entier, ou demandez-en un nouveau à votre administrateur.',
}
