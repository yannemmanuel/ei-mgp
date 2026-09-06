import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  aPermission,
  aRole,
  aUnePermissionParmi,
  parcoursAutorises,
  type UtilisateurAutorise,
} from '@/server/authz'

/**
 * EX-GES-01 : liste des dossiers, filtrable — port de `App\Livewire\Dossiers\DossierListPage`.
 *
 * ⚠️ Le périmètre ci-dessous DOIT refléter exactement `peutVoirDossier()` : ne jamais faire
 * apparaître dans une liste un dossier que la policy refuserait à l'unité. Un test croise les
 * deux implémentations pour garantir qu'elles ne divergent pas.
 */

/** Clause `where` correspondant au périmètre visible par cet utilisateur. */
export function perimetreDossiers(u: UtilisateurAutorise): Prisma.dossiersWhereInput {
  // Un employé déclarant ne voit QUE ses propres dossiers non anonymes : un dossier anonyme
  // n'est rattaché à personne, même si son auteur était connecté (RG-06).
  if (aRole(u, 'employe_declarant')) {
    return { declarant_user_id: u.id, is_anonymous: false }
  }

  if (aPermission(u, 'dossiers.view.all')) {
    return {}
  }

  if (aUnePermissionParmi(u, ['dossiers.view', 'dossiers.view.own'])) {
    return { parcours: { code: { in: parcoursAutorises(u.roles) } } }
  }

  // Aucun accès : clause impossible plutôt que périmètre vide implicite, pour qu'un oubli de
  // branche ne se traduise jamais par « tout voir ».
  return { id: { in: [] } }
}

export type FiltresDossiers = {
  parcoursId?: string
  categorieId?: string
  statutId?: string
  niveauGraviteId?: string
  periodeDebut?: string
  periodeFin?: string
  /** Restreint aux dossiers dont l'utilisateur est titulaire actif. */
  assigneAMoi?: boolean
}

function clauseFiltres(u: UtilisateurAutorise, filtres: FiltresDossiers): Prisma.dossiersWhereInput {
  const where: Prisma.dossiersWhereInput = {}

  if (filtres.parcoursId) where.parcours_id = BigInt(filtres.parcoursId)
  if (filtres.categorieId) where.categorie_id = BigInt(filtres.categorieId)
  if (filtres.statutId) where.statut_id = BigInt(filtres.statutId)
  if (filtres.niveauGraviteId) where.niveau_gravite_id = BigInt(filtres.niveauGraviteId)

  if (filtres.periodeDebut || filtres.periodeFin) {
    where.created_at = {
      ...(filtres.periodeDebut ? { gte: new Date(filtres.periodeDebut) } : {}),
      ...(filtres.periodeFin ? { lte: new Date(`${filtres.periodeFin}T23:59:59.999`) } : {}),
    }
  }

  if (filtres.assigneAMoi) {
    where.dossier_affectations = { some: { user_id: u.id, actif: true } }
  }

  return where
}

const PAR_PAGE = 20

export async function listerDossiers(
  u: UtilisateurAutorise,
  filtres: FiltresDossiers = {},
  page = 1
) {
  const where: Prisma.dossiersWhereInput = {
    AND: [perimetreDossiers(u), clauseFiltres(u, filtres)],
  }

  const [total, dossiers] = await Promise.all([
    prisma.dossiers.count({ where }),
    prisma.dossiers.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
      select: {
        id: true,
        reference: true,
        created_at: true,
        is_anonymous: true,
        parcours: { select: { id: true, libelle: true, code: true } },
        categories: { select: { libelle: true } },
        niveaux_gravite: { select: { libelle: true, niveau: true, couleur: true } },
        statuts_dossier: { select: { libelle_interne: true, code: true } },
      },
    }),
  ])

  return { dossiers, total, page, parPage: PAR_PAGE, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) }
}

/** Référentiels alimentant les listes déroulantes de filtres. */
export async function referentielsFiltres(parcoursId?: string) {
  const [parcours, categories, statuts, gravites] = await Promise.all([
    prisma.parcours.findMany({ where: { actif: true }, orderBy: { ordre: 'asc' }, select: { id: true, libelle: true } }),
    prisma.categories.findMany({
      where: { actif: true, ...(parcoursId ? { parcours_id: BigInt(parcoursId) } : {}) },
      orderBy: { libelle: 'asc' },
      select: { id: true, libelle: true },
    }),
    prisma.statuts_dossier.findMany({ orderBy: { ordre: 'asc' }, select: { id: true, libelle_interne: true } }),
    prisma.niveaux_gravite.findMany({ where: { actif: true }, orderBy: { niveau: 'asc' }, select: { id: true, libelle: true } }),
  ])

  return { parcours, categories, statuts, gravites }
}
