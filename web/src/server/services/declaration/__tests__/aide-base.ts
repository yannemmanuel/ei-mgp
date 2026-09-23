import { prisma } from '@/lib/prisma'
import { MODELES } from '@/server/modeles'
import { magasinNomme } from '../../stockage/magasin'

/**
 * Utilitaires des tests de création de déclaration.
 *
 * Ces tests écrivent réellement en base : c'est le seul moyen de vérifier la transaction, la
 * séquence de référence (verrou `FOR UPDATE`) et l'affectation automatique. Chaque dossier créé
 * est donc supprimé en fin de test par `nettoyerDossiers()`.
 *
 * La suppression n'existe QUE dans ces utilitaires de test : l'application, elle, n'expose
 * aucune voie de suppression d'un dossier (RG-03).
 */

const MODEL_TYPE_DOSSIER = MODELES.dossier

export async function categoriePour(parcoursCode: string, options: { autre?: boolean } = {}) {
  const parcours = await prisma.parcours.findFirstOrThrow({ where: { code: parcoursCode } })

  return prisma.categories.findFirstOrThrow({
    where: { parcours_id: parcours.id, is_autre: options.autre ?? false, actif: true },
  })
}

export function graviteParNiveau(niveau: number) {
  return prisma.niveaux_gravite.findFirstOrThrow({ where: { niveau } })
}

/**
 * Supprime un dossier et tout ce qui en dépend, dans l'ordre imposé par les clés étrangères.
 *
 * ⚠️ LES FICHIERS PARTENT AVEC LEURS LIGNES depuis le 2026-09-22. Cette fonction effaçait les
 * lignes de `pieces_jointes` en laissant les fichiers dans le magasin : chaque exécution de la
 * suite ajoutait donc des fichiers que plus aucune ligne ne désignait, donc que plus rien ne
 * retrouverait. C'est le mécanisme même des 17 pièces orphelines relevées par l'audit — ici à
 * petite échelle, et sur le poste de développement.
 *
 * ⚠️ INVESTIGATIONS ET ACTIONS CORRECTIVES y sont aussi depuis la même date. Elles portent une
 * clé étrangère vers `dossiers` : un test qui en crée voyait la suppression du dossier ÉCHOUER,
 * et laissait le dossier entier en base — sans que rien ne le dise, l'erreur survenant dans un
 * `afterAll`.
 */
export async function nettoyerDossiers(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return

  const dossierIn = { dossier_id: { in: [...ids] } }

  const pieces = await prisma.pieces_jointes.findMany({
    where: { attachable_type: MODEL_TYPE_DOSSIER, attachable_id: { in: [...ids] } },
    select: { id: true, disque: true, chemin: true },
  })

  for (const piece of pieces) {
    // Le magasin peut être inconnu si un test a corrompu la colonne à dessein : le nettoyage ne
    // doit pas échouer pour autant, sans quoi il laisserait TOUT le reste derrière lui.
    try {
      await magasinNomme(piece.disque).supprimer(piece.chemin)
    } catch {
      // Sans conséquence : le fichier reste, la ligne part. Signalé pour ne pas être silencieux.
      console.warn(`Nettoyage : fichier non effacé (${piece.disque}) ${piece.chemin}`)
    }
  }

  await prisma.pieces_jointes.deleteMany({ where: { id: { in: pieces.map((p) => p.id) } } })
  // Les actions AVANT les investigations : `actions_correctives.investigation_id` les cite.
  await prisma.actions_correctives.deleteMany({ where: dossierIn })
  await prisma.investigations.deleteMany({ where: dossierIn })
  await prisma.historique_statuts.deleteMany({ where: dossierIn })
  await prisma.dossier_affectations.deleteMany({ where: dossierIn })
  await prisma.declaration_identites.deleteMany({ where: dossierIn })
  await prisma.messages.deleteMany({ where: dossierIn })
  await prisma.dossiers.deleteMany({ where: { id: { in: [...ids] } } })
}

/**
 * Supprime des lignes d'audit produites par un test.
 *
 * ⚠️ `auditable_type` est OBLIGATOIRE, et ce n'est pas une commodité de typage. `auditable_id`
 * est une colonne texte partagée par tous les modèles : un identifiant numérique comme « 34 »
 * désigne aussi bien une catégorie qu'une investigation ou un compte. Un nettoyage qui ne
 * filtrerait que sur l'identifiant effacerait des lignes d'audit sans rapport — c'est
 * exactement ce qui s'est produit à l'étape 11 (17 lignes de la baseline perdues), et la
 * signature de cette fonction existe pour que cela ne puisse pas se reproduire.
 */
export async function nettoyerAudit(
  auditableType: string,
  ids: readonly (string | bigint)[]
): Promise<void> {
  if (ids.length === 0) return

  await prisma.audit_logs.deleteMany({
    where: { auditable_type: auditableType, auditable_id: { in: ids.map((id) => String(id)) } },
  })
}

/**
 * Confie un dossier à un compte, pour poser une situation de test.
 *
 * ⚠️ Écrit la ligne DIRECTEMENT, sans passer par aucun service — et c'est volontaire. La
 * réaffectation manuelle a été supprimée : les affectations découlent désormais du parcours et du
 * rattachement, à la création. Les cas qui ont besoin d'un titulaire précis posent donc l'état
 * qu'ils veulent exercer, au lieu de détourner une fonction métier pour l'obtenir.
 *
 * Remplace les titulaires actifs plutôt que d'en ajouter un : un test qui en cumulerait
 * n'exercerait plus la situation qu'il décrit.
 */
export async function confierPourTest(dossierId: string, utilisateurId: bigint): Promise<void> {
  await prisma.dossier_affectations.updateMany({
    where: { dossier_id: dossierId, actif: true },
    data: { actif: false, desaffecte_le: new Date() },
  })

  await prisma.dossier_affectations.create({
    data: {
      dossier_id: dossierId,
      user_id: utilisateurId,
      affecte_par: utilisateurId,
      type: 'test',
      actif: true,
      affecte_le: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
  })

  /*
    ⚠️ LE DOSSIER RESTE À « REÇU », et c'est désormais l'état que l'application produit.

    Ce bloc le faisait passer à « Affecté », pour imiter ce que faisait `creerDeclaration()` quand
    l'affectation automatique aboutissait. « Affecté » a quitté le circuit le 2026-09-21 : un
    dossier confié à quelqu'un reste à « Reçu » jusqu'à ce qu'on l'analyse, et c'est de là que
    partent les transitions suivantes.

    Le laisser déplacer le dossier aurait placé les cas dans un état que plus rien n'atteint — ils
    auraient exercé une situation qui n'existe pas, ce qui est la façon la plus discrète pour une
    suite de tests de cesser de prouver quoi que ce soit.
  */
}
