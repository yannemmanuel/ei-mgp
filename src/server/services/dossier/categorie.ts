import { prisma } from '@/lib/prisma'
import { MODELES } from '@/server/modeles'
import { journaliser } from '@/server/services/audit/journal'
import { ErreurWorkflow } from './workflow'

/**
 * Requalifie la catégorie pendant le traitement sans modifier le type de déclaration.
 * La catégorie cible doit être active et appartenir au même parcours que le dossier.
 */
export async function modifierCategorieDossier(params: {
  dossierId: string
  categorieId: bigint
  precisionAutre?: string | null
  acteurId: bigint
}): Promise<void> {
  const [dossier, categorie] = await Promise.all([
    prisma.dossiers.findUnique({
      where: { id: params.dossierId },
      select: {
        categorie_id: true,
        categorie_autre_precision: true,
        parcours_id: true,
        categories: { select: { libelle: true } },
      },
    }),
    prisma.categories.findUnique({
      where: { id: params.categorieId },
      select: { id: true, parcours_id: true, libelle: true, is_autre: true, actif: true },
    }),
  ])

  if (!dossier) throw new ErreurWorkflow('Dossier inconnu.')
  if (!categorie || !categorie.actif) {
    throw new ErreurWorkflow('Cette catégorie est inconnue ou désactivée.')
  }
  if (categorie.parcours_id !== dossier.parcours_id) {
    throw new ErreurWorkflow('Cette catégorie ne correspond pas au type de la déclaration.')
  }

  const precision = (params.precisionAutre ?? '').trim()
  if (categorie.is_autre && precision === '') {
    throw new ErreurWorkflow('Précisez la catégorie lorsque vous choisissez « Autre ».')
  }
  if (precision.length > 500) {
    throw new ErreurWorkflow('La précision de la catégorie ne peut pas dépasser 500 caractères.')
  }

  const precisionEnregistree = categorie.is_autre ? precision : null
  if (
    dossier.categorie_id === categorie.id &&
    dossier.categorie_autre_precision === precisionEnregistree
  ) {
    return
  }

  await prisma.dossiers.update({
    where: { id: params.dossierId },
    data: {
      categorie_id: categorie.id,
      categorie_autre_precision: precisionEnregistree,
      updated_at: new Date(),
    },
  })

  await journaliser({
    action: 'dossier.categorie_modifiee',
    acteurId: params.acteurId,
    auditableType: MODELES.dossier,
    auditableId: params.dossierId,
    anciennes: {
      categorie_id: dossier.categorie_id,
      categorie: dossier.categories.libelle,
      categorie_autre_precision: dossier.categorie_autre_precision,
    },
    nouvelles: {
      categorie_id: categorie.id,
      categorie: categorie.libelle,
      categorie_autre_precision: precisionEnregistree,
    },
  })
}
