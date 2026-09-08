import { prisma } from '@/lib/prisma'
import { journaliser, MODELES } from '@/server/services/audit/journal'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { hacher, verifier } from './hachage'

/**
 * Changement de mot de passe par son porteur.
 *
 * Distinct de `regenererMotDePasse()`, qui est un geste d'administration : là, un tiers fixe une
 * valeur qu'il connaît ; ici, le porteur en choisit une que personne d'autre ne connaîtra. C'est
 * toute la raison d'être de l'écran — un mot de passe transmis par un administrateur reste connu
 * de lui tant qu'il n'a pas été remplacé.
 */

/**
 * Longueur minimale, en caractères.
 *
 * Douze plutôt que huit : le générateur de l'administration en produit quatorze, et un minimum
 * inférieur laisserait choisir plus faible que ce que la machine attribue. Aucune règle de
 * composition — ni majuscule ni chiffre imposés : elles produisent des mots de passe prévisibles
 * (« Motdepasse1! ») sans ajouter d'entropie réelle, ce que le NIST SP 800-63B recommande
 * d'abandonner depuis 2017.
 */
export const LONGUEUR_MINIMALE = 12

/**
 * Plafond en OCTETS, imposé par bcrypt.
 *
 * bcrypt ignore silencieusement tout ce qui dépasse 72 octets : accepter un mot de passe plus
 * long donnerait l'illusion d'une phrase de passe robuste dont seuls les 72 premiers octets
 * comptent — et deux valeurs différant après cette borne ouvriraient le même compte. La mesure est
 * faite en octets, pas en caractères : un accent en pèse deux, un emoji jusqu'à quatre.
 */
export const OCTETS_MAXIMUM = 72

export function longueurEnOctets(valeur: string): number {
  return new TextEncoder().encode(valeur).length
}

export async function changerMotDePasse(params: {
  utilisateurId: bigint
  actuel: string
  nouveau: string
  confirmation: string
}): Promise<void> {
  const { nouveau, confirmation } = params

  if (nouveau !== confirmation) {
    throw new ErreurWorkflow('Les deux saisies ne correspondent pas.')
  }

  // Pas de `trim()` : une espace en tête ou en fin fait partie du mot de passe, et la retirer
  // silencieusement rendrait impossible de se reconnecter avec ce qu'on croit avoir saisi.
  if (nouveau.length < LONGUEUR_MINIMALE) {
    throw new ErreurWorkflow(
      `Le mot de passe doit compter au moins ${LONGUEUR_MINIMALE} caractères.`
    )
  }

  if (longueurEnOctets(nouveau) > OCTETS_MAXIMUM) {
    throw new ErreurWorkflow(
      `Le mot de passe est trop long (${OCTETS_MAXIMUM} octets au maximum). Les accents et emojis comptent pour plusieurs octets.`
    )
  }

  if (nouveau === params.actuel) {
    throw new ErreurWorkflow('Le nouveau mot de passe doit être différent de l’actuel.')
  }

  const compte = await prisma.users.findUniqueOrThrow({
    where: { id: params.utilisateurId },
    select: { id: true, actif: true, password: true },
  })

  if (!compte.actif) {
    throw new ErreurWorkflow('Ce compte est désactivé.')
  }

  /**
   * Le mot de passe actuel est exigé, même sur une session déjà ouverte.
   *
   * Sans cela, un poste laissé déverrouillé quelques secondes suffirait à s'approprier le compte
   * définitivement : le voleur changerait le mot de passe sans jamais avoir connu l'ancien, et le
   * porteur légitime se retrouverait dehors.
   */
  if (compte.password === null || !(await verifier(params.actuel, compte.password))) {
    throw new ErreurWorkflow('Le mot de passe actuel est incorrect.')
  }

  await prisma.users.update({
    where: { id: compte.id },
    data: {
      password: await hacher(nouveau),
      doit_changer_mot_de_passe: false,
      updated_at: new Date(),
    },
  })

  await journaliser({
    action: 'user.mot_de_passe_change',
    acteurId: compte.id,
    auditableType: MODELES.utilisateur,
    auditableId: String(compte.id),
    // Ni la valeur, ni son empreinte : seul le fait que l'opération a eu lieu (docs/exigences-audit.md).
    nouvelles: { mot_de_passe_change: true },
  })
}
