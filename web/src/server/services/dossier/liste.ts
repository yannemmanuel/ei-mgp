import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  aPermission,
  aRole,
  parcoursAutorises,
  peutFaireAvancerDepuis,
  siteCloisonnant,
  type UtilisateurAutorise,
} from '@/server/authz'
import { STATUTS, transitionsDepuis } from './statuts'

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

  // Cloisonnement par site, traduit en SQL comme dans `peutVoirDossier()`. Un dossier sans site
  // n'est retenu par aucune de ces clauses : c'est voulu.
  const site = siteCloisonnant(u)
  const parSite: Prisma.dossiersWhereInput = site === null ? {} : { site_id: site }

  if (aPermission(u, 'dossiers.view')) {
    return { ...parSite, parcours: { code: { in: parcoursAutorises(u) } } }
  }

  // `dossiers.view.own` : SES dossiers, pas tout son parcours. Traduction en SQL de la branche
  // correspondante de `peutVoirDossier()` — les deux doivent dire exactement la même chose, et
  // un test croise les deux implémentations dossier par dossier.
  if (aPermission(u, 'dossiers.view.own')) {
    return {
      ...parSite,
      parcours: { code: { in: parcoursAutorises(u) } },
      OR: [
        { dossier_affectations: { some: { user_id: u.id, actif: true } } },
        { declarant_user_id: u.id },
      ],
    }
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
  /** Restreint aux dossiers dont l'étape courante revient à ce rôle (docs/workflows.md §3). */
  aMoiDAgir?: boolean
  /** Reçus sans aucun destinataire actif : personne ne les traite. */
  nonAffectes?: boolean
}

/**
 * Dossiers que CET utilisateur peut faire avancer, ici et maintenant.
 *
 * « Être affecté » et « avoir la main » sont deux choses différentes : plusieurs personnes sont
 * affectées à un même dossier tout au long de sa vie, mais à chaque étape une seule catégorie
 * d'acteurs peut le faire progresser. Sans ce filtre, chacun voit une liste où l'immense majorité
 * des lignes ne lui demande rien — et le dossier qui l'attend s'y noie.
 */
function clauseAMoiDAgir(u: UtilisateurAutorise): Prisma.dossiersWhereInput {
  if (!aPermission(u, 'dossiers.status.update')) {
    return { id: { in: [] } }
  }

  const branches = parcoursAutorises(u).map((parcours) => ({
    parcours: { code: parcours },
    statuts_dossier: {
      code: {
        in: STATUTS.filter((statut) => peutFaireAvancerDepuis(u.roles, parcours, statut)).filter(
          (statut) => transitionsDepuis(statut).length > 0
        ),
      },
    },
  }))

  return branches.length === 0 ? { id: { in: [] } } : { OR: branches }
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

  if (filtres.aMoiDAgir) {
    where.AND = [clauseAMoiDAgir(u)]
  }

  if (filtres.nonAffectes) {
    // « Reçu » ET sans destinataire actif : l'affectation automatique n'a trouvé aucun compte
    // portant le rôle de captage du parcours (EX-GES-02). Le dossier existe, personne ne l'a.
    where.statuts_dossier = { code: 'recu' }
    where.dossier_affectations = { none: { actif: true } }
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
        // Nécessaire au test qui croise cette clause avec `peutVoirDossier()` : sans le site, il
        // ne pourrait pas vérifier le cloisonnement qu'il est là pour surveiller.
        site_id: true,
        parcours: { select: { id: true, libelle: true, code: true } },
        categories: { select: { libelle: true } },
        niveaux_gravite: { select: { libelle: true, niveau: true, couleur: true } },
        statuts_dossier: { select: { libelle_interne: true, code: true } },
      },
    }),
  ])

  return { dossiers, total, page, parPage: PAR_PAGE, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) }
}

/**
 * Référentiels alimentant les listes déroulantes de filtres.
 *
 * Les catégories appartiennent chacune à un parcours, et plusieurs portent le même libellé d'un
 * parcours à l'autre — « Autre » existe quatre fois, « Environnement » deux fois. Tant qu'aucun
 * parcours n'est choisi, la liste complète affichait donc des doublons impossibles à départager.
 * Le parcours est alors accolé au libellé ; dès qu'un parcours est retenu, l'ambiguïté disparaît
 * avec lui et le suffixe aussi.
 */
export async function referentielsFiltres(parcoursId?: string) {
  const [parcours, categories, statuts, gravites] = await Promise.all([
    prisma.parcours.findMany({ where: { actif: true }, orderBy: { ordre: 'asc' }, select: { id: true, libelle: true } }),
    prisma.categories.findMany({
      where: { actif: true, ...(parcoursId ? { parcours_id: BigInt(parcoursId) } : {}) },
      orderBy: [{ parcours: { ordre: 'asc' } }, { libelle: 'asc' }],
      select: { id: true, libelle: true, parcours: { select: { libelle: true } } },
    }),
    prisma.statuts_dossier.findMany({ orderBy: { ordre: 'asc' }, select: { id: true, libelle_interne: true } }),
    prisma.niveaux_gravite.findMany({ where: { actif: true }, orderBy: { niveau: 'asc' }, select: { id: true, libelle: true } }),
  ])

  return {
    parcours,
    categories: categories.map((c) => ({
      id: c.id,
      libelle: parcoursId ? c.libelle : `${c.libelle} — ${c.parcours.libelle}`,
    })),
    statuts,
    gravites,
  }
}
