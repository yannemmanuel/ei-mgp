import { prisma } from '@/lib/prisma'

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

const MODEL_TYPE_DOSSIER = String.raw`App\Models\Dossier`

export async function categoriePour(parcoursCode: string, options: { autre?: boolean } = {}) {
  const parcours = await prisma.parcours.findFirstOrThrow({ where: { code: parcoursCode } })

  return prisma.categories.findFirstOrThrow({
    where: { parcours_id: parcours.id, is_autre: options.autre ?? false, actif: true },
  })
}

export function graviteParNiveau(niveau: number) {
  return prisma.niveaux_gravite.findFirstOrThrow({ where: { niveau } })
}

/** Supprime un dossier et tout ce qui en dépend, dans l'ordre imposé par les clés étrangères. */
export async function nettoyerDossiers(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return

  const dossierIn = { dossier_id: { in: [...ids] } }

  await prisma.pieces_jointes.deleteMany({
    where: { attachable_type: MODEL_TYPE_DOSSIER, attachable_id: { in: [...ids] } },
  })
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
