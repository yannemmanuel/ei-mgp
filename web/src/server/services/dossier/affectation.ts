import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from './workflow'

/**
 * EX-GES-03 : réaffectation manuelle, motif obligatoire, tracée — port de
 * `App\Services\Dossier\AffectationService`.
 *
 * REMPLACE le ou les titulaires actifs plutôt que d'en ajouter un : une réaffectation change le
 * responsable, elle ne l'étend pas. L'affectation automatique multi-utilisateurs faite à la
 * création (EX-GES-02) reste, elle, inchangée.
 */
export async function reaffecter(params: {
  dossierId: string
  nouvelUtilisateurId: bigint
  effectueParId: bigint
  motif: string
}): Promise<void> {
  // Revérifié ici et pas seulement côté formulaire : ce service est le point d'entrée unique de
  // toute réaffectation.
  if (params.motif.trim() === '') {
    throw new ErreurWorkflow('Le motif de réaffectation est obligatoire (EX-GES-03).')
  }

  await prisma.$transaction(async (tx) => {
    const dossier = await tx.dossiers.findUniqueOrThrow({
      where: { id: params.dossierId },
      select: {
        id: true,
        statut_id: true,
        declarant_user_id: true,
        statuts_dossier: { select: { code: true } },
      },
    })

    // DT-06 : un utilisateur ne peut jamais être désigné traitant de son propre dossier.
    // Ne concerne que cette désignation manuelle et délibérée d'une personne précise —
    // l'affectation automatique notifie une équipe entière par rôle, mécanisme de portée
    // différente.
    if (
      dossier.declarant_user_id !== null &&
      dossier.declarant_user_id === params.nouvelUtilisateurId
    ) {
      throw new ErreurWorkflow(
        "Un utilisateur ne peut pas être affecté comme traitant de son propre dossier (DT-06)."
      )
    }

    const maintenant = new Date()

    await tx.dossier_affectations.updateMany({
      where: { dossier_id: params.dossierId, actif: true },
      data: { actif: false, desaffecte_le: maintenant },
    })

    await tx.dossier_affectations.create({
      data: {
        dossier_id: params.dossierId,
        user_id: params.nouvelUtilisateurId,
        affecte_par: params.effectueParId,
        motif: params.motif,
        type: 'reaffectation',
        actif: true,
        affecte_le: maintenant,
        created_at: maintenant,
        updated_at: maintenant,
      },
    })

    // Un dossier encore « Reçu » (aucun titulaire à la création) passe naturellement à
    // « Affecté » dès qu'un responsable lui est assigné.
    if (dossier.statuts_dossier.code === 'recu') {
      const statutAffecte = await tx.statuts_dossier.findFirstOrThrow({ where: { code: 'affecte' } })

      await tx.dossiers.update({
        where: { id: params.dossierId },
        data: { statut_id: statutAffecte.id, updated_at: maintenant },
      })

      await tx.historique_statuts.create({
        data: {
          dossier_id: params.dossierId,
          statut_precedent_id: dossier.statut_id,
          statut_suivant_id: statutAffecte.id,
          commentaire: `Affectation manuelle : ${params.motif}`,
          effectue_par: params.effectueParId,
          created_at: maintenant,
        },
      })
    }
  })
}

/**
 * Utilisateurs proposables à la réaffectation. Le déclarant identifié en est exclu (DT-06) :
 * proposer une option qui échouerait côté serveur serait une mauvaise ergonomie.
 */
export async function utilisateursAffectables(dossierId: string) {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { declarant_user_id: true },
  })

  return prisma.users.findMany({
    where: {
      actif: true,
      ...(dossier.declarant_user_id !== null ? { id: { not: dossier.declarant_user_id } } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}
