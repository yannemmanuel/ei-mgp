import { prisma } from '@/lib/prisma'
import { MODELES } from '@/server/modeles'
import { magasinNomme } from '../stockage/magasin'

/**
 * Ce qu'une anonymisation doit RÉELLEMENT effacer d'un dossier.
 *
 * ⚠️ CE MODULE EXISTE PARCE QUE L'ANONYMISATION MENTAIT. Elle supprimait la ligne
 * `declaration_identites` puis marquait `anonymise_le` — et s'arrêtait là. Survivaient :
 *
 *   - les PIÈCES JOINTES, fichiers compris. Une photo d'accident montre des visages, un badge,
 *     une plaque d'immatriculation ;
 *   - les MESSAGES échangés avec le déclarant ;
 *   - `investigations.personnes_rencontrees`, qui est littéralement une liste de personnes ;
 *   - `actions_correctives.responsable_nom`, qui est un nom ;
 *   - l'entreprise du sous-traitant, les quatre colonnes de poste, les commentaires d'historique
 *     et tous les champs libres, où un nom est fréquemment écrit.
 *
 * Le dossier était donc déclaré anonymisé alors qu'il restait ré-identifiable — et la trace
 * juridique affirmait que l'obligation était tenue. **C'est le pire des deux mondes** : sans la
 * marque, quelqu'un finit par revenir sur le dossier ; avec elle, plus personne.
 *
 * ⚠️ LE PÉRIMÈTRE EST ÉCRIT ICI, PAS DÉDUIT. Aucune boucle sur « toutes les colonnes texte » :
 * une colonne ajoutée demain serait silencieusement oubliée ou silencieusement effacée, et les
 * deux sont graves. La liste se relit, et se modifie sciemment.
 */

/**
 * Ce qui remplace un champ libre effacé.
 *
 * ⚠️ UNE MENTION, PAS UN VIDE. Un champ à `NULL` se lit comme « jamais renseigné » : le dossier
 * paraîtrait avoir été déposé sans description, ce qui est faux et rend son historique
 * incompréhensible. La mention dit qu'il y avait quelque chose, et pourquoi il n'y est plus.
 */
export const MENTION_EFFACE = '[Contenu effacé — politique de conservation RG-11]'

/**
 * Colonnes de `dossiers` remises à NULL : elles ne portent QUE de l'identification.
 *
 * ⚠️ `entreprise` EN FAIT PARTIE. Sur un grief de sous-traitant, le nom de l'entreprise désigne
 * souvent une structure de quelques personnes : la conserver revient à conserver un pointeur vers
 * le déclarant. Les quatre colonnes de poste posent le même problème dans une direction
 * restreinte, où un poste unique ne désigne qu'une personne.
 */
const COLONNES_NOMINATIVES = [
  'entreprise',
  'poste',
  'poste_precision',
  'poste_declarant',
  'poste_declarant_precision',
  'statut_plaignant_precision',
] as const

/**
 * Champs libres remplacés par la mention : ils portent la SUBSTANCE, et c'est aussi là que les
 * noms s'écrivent.
 *
 * ⚠️ CE CHOIX EST UN ARBITRAGE, et il mérite d'être contesté plutôt que subi. À dix ans d'une
 * clôture, la valeur statistique d'un dossier tient dans ses champs STRUCTURÉS — type, catégorie,
 * gravité, délais —, que RG-12 exige de garder calculables sans limite de durée et qui ne sont
 * pas touchés ici. La valeur du texte libre, elle, est alors proche de zéro ; son risque, non.
 *
 * Si le métier veut conserver ces textes, la décision doit être ÉCRITE : ce sont eux qui font
 * qu'un dossier reste ré-identifiable après anonymisation.
 */
const CHAMPS_LIBRES = [
  'description',
  'attentes_declarant',
  'precision_localisation',
  'categorie_autre_precision',
  'proposition_mesure_corrective',
  'synthese_resolution',
  'motif_reouverture',
  'motif_rejet',
] as const

/**
 * Ce qui N'EST PAS touché, et pourquoi — la moitié qu'on oublie d'écrire.
 *
 *   `reference`                      identifiant public du dossier ; l'effacer rendrait le
 *                                    dossier introuvable, y compris pour un auditeur
 *   `parcours_id`, `categorie_id`,   les champs STRUCTURÉS : RG-12 exige que les statistiques
 *   `niveau_gravite_id`, les dates   restent calculables sans limite de durée
 *   `lieu`, `ville`                  contraints au référentiel, donc non nominatifs
 *   `site_id`, `direction_id`        rattachement organisationnel, pas une personne
 *   la LIGNE `dossiers` elle-même    RG-03 : un dossier ne se supprime jamais
 *   la ligne `messages`              conservée vidée de son corps : le FAIT qu'un échange ait eu
 *                                    lieu, et combien, reste une donnée d'instruction
 *   `audit_logs`                     journal en ajout seul (CDC §15). Il consigne des ACTIONS,
 *                                    pas le contenu des dossiers ; le vérifier reste un travail
 *                                    à part, distinct de celui-ci
 */

export type ResultatEffacement = {
  readonly identitesSupprimees: number
  readonly piecesSupprimees: number
  readonly messagesVides: number
  readonly commentairesVides: number
  readonly investigationsNettoyees: number
  readonly actionsNettoyees: number
}

/**
 * Efface tout ce qui identifie, sur UN dossier.
 *
 * ⚠️ NE MARQUE PAS LE DOSSIER. L'appelant le fait, et seulement si cette fonction a rendu la
 * main sans lever : une anonymisation à moitié faite qui porterait quand même sa marque ne serait
 * jamais reprise, et le dossier resterait ré-identifiable pour toujours sous un drapeau qui dit
 * le contraire.
 *
 * ⚠️ LES FICHIERS PARTENT AVANT LEURS LIGNES. Dans l'autre sens, une interruption entre les deux
 * laisserait des fichiers que plus aucune ligne ne désigne — donc introuvables, donc jamais
 * effacés. Ici, une interruption laisse au pire une ligne dont le fichier est déjà parti : la
 * reprise la retrouvera, et `supprimer()` est idempotent pour cette raison précise.
 */
export async function effacerDonneesPersonnelles(dossierId: string): Promise<ResultatEffacement> {
  const pieces = await prisma.pieces_jointes.findMany({
    where: { attachable_type: MODELES.dossier, attachable_id: dossierId },
    select: { id: true, disque: true, chemin: true },
  })

  for (const piece of pieces) {
    await magasinNomme(piece.disque).supprimer(piece.chemin)
  }

  const piecesSupprimees = await prisma.pieces_jointes.deleteMany({
    where: { id: { in: pieces.map((p) => p.id) } },
  })

  const identites = await prisma.declaration_identites.deleteMany({
    where: { dossier_id: dossierId },
  })

  /*
    Le corps des messages, pas les lignes.

    ⚠️ `nom_original` d'une pièce jointe ne pose PAS le même problème, et c'est pour ça que les
    pièces partent entièrement : « photo-jean-dupont.jpg » est un nom, et rien dans cette ligne ne
    mérite d'être conservé une fois le fichier parti.
  */
  const messages = await prisma.messages.updateMany({
    where: { dossier_id: dossierId },
    data: { corps: MENTION_EFFACE },
  })

  const commentaires = await prisma.historique_statuts.updateMany({
    where: { dossier_id: dossierId, commentaire: { not: null } },
    data: { commentaire: MENTION_EFFACE },
  })

  /*
    ⚠️ `personnes_rencontrees` EST AUSSI NOMINATIVE QUE `nom_prenom`, et elle survivait. Les
    autres champs d'investigation portent la substance de l'enquête, et les mêmes noms : ils
    suivent le même sort que les champs libres du dossier.
  */
  const investigations = await prisma.investigations.updateMany({
    where: { dossier_id: dossierId },
    data: {
      personnes_rencontrees: null,
      faits_constates: MENTION_EFFACE,
      cause_immediate: MENTION_EFFACE,
      causes_racines: MENTION_EFFACE,
      recommandations: MENTION_EFFACE,
    },
  })

  // `responsable_nom` est un nom ; `responsable_id` pointe vers un COMPTE, qui n'est pas la
  // personne concernée par le dossier et n'a donc pas à être effacé.
  const actions = await prisma.actions_correctives.updateMany({
    where: { dossier_id: dossierId },
    data: {
      responsable_nom: null,
      description: MENTION_EFFACE,
      verification_commentaire: null,
    },
  })

  await prisma.dossiers.update({
    where: { id: dossierId },
    data: {
      ...Object.fromEntries(COLONNES_NOMINATIVES.map((c) => [c, null])),
      ...Object.fromEntries(CHAMPS_LIBRES.map((c) => [c, MENTION_EFFACE])),
    },
  })

  return {
    identitesSupprimees: identites.count,
    piecesSupprimees: piecesSupprimees.count,
    messagesVides: messages.count,
    commentairesVides: commentaires.count,
    investigationsNettoyees: investigations.count,
    actionsNettoyees: actions.count,
  }
}
