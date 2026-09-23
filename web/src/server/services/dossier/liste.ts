import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  aPermission,
  directionCloisonnante,
  parcoursAutorises,
  type ParcoursCode,
  peutFaireAvancerDepuis,
  siteCloisonnant,
  type UtilisateurAutorise,
} from '@/server/authz'
import { STATUTS, transitionsDepuis } from './statuts'
import { couvertureParParcours, type CouvertureParcours } from './suivi-ei'

/*
  ⚠️ PLUS AUCUN PARCOURS N'EST AFFECTÉ depuis le 2026-09-20.

  La constante nommait l'évènement indésirable, seul parcours dont la charge venait du
  rattachement. Les griefs suivent la même logique désormais : les quatre types reviennent à qui
  est habilité dessus et dont le rattachement couvre le dossier.
*/

/**
 * « Reçu, et personne ne le traite » — définition partagée par le compteur du tableau de bord et
 * la liste qu'il ouvre, qui compteraient sinon différemment.
 *
 * ⚠️ Deux sens selon le parcours : sans ligne d'affectation active dans le cas courant ; pour
 * l'évènement indésirable, qui n'en a jamais, aucun chargé de sécurité dont le rattachement
 * couvre le dossier.
 */
/**
 * « Les dossiers dont JE réponds » — définition partagée par la carte du tableau de bord, son lien
 * et son compteur, qui montraient sinon trois choses différentes.
 *
 * ⚠️ Deux origines à la charge : une affectation active, ou le RATTACHEMENT pour l'évènement
 * indésirable, qui n'est affecté à personne. Le rôle est exigé en plus du rattachement — un compte
 * transverse voit tous les EI sans en avoir la charge.
 */
export function clauseDontJeReponds(u: UtilisateurAutorise): Prisma.dossiersWhereInput {
  const parAffectation: Prisma.dossiersWhereInput = {
    dossier_affectations: { some: { user_id: u.id, actif: true } },
  }

  // ⚠️ Qui traite est un PARAMÈTRE du rôle, jamais déduit de `dossiers.status.update` : le
  // Service MGP porte ce droit sans être traitant, et le déduire le faisait apparaître titulaire
  // de tous les dossiers.
  if (!u.traiteLesDossiers) return parAffectation

  // Même ordre que `rattachementCouvre()` : la direction d'abord, le site ensuite, et rien du
  // tout quand le compte n'est borné par aucun des deux — il répond alors de tout son périmètre.
  const direction = directionCloisonnante(u)
  const site = siteCloisonnant(u)
  const parRattachement: Prisma.dossiersWhereInput =
    direction !== null ? { direction_id: direction } : site !== null ? { site_id: site } : {}

  return {
    OR: [
      parAffectation,
      {
        // Les types que ses rôles ouvrent, bornés par son rattachement.
        parcours: { code: { in: parcoursAutorises(u) } },
        ...parRattachement,
        // ⚠️ DT-06 : le déclarant n'instruit jamais son propre dossier. Ne concerne que les
        // déclarations identifiées — une anonyme n'est rattachée à aucun compte (RG-06).
        /*
          ⚠️ LA FORME EXPLICITE, et non `NOT: { declarant_user_id: u.id }`.

          En SQL, `NOT (colonne = 5)` vaut NULL quand la colonne est nulle — donc faux, donc la
          ligne est ÉCARTÉE. Écrit ainsi, le garde aurait retiré toutes les déclarations ANONYMES
          du périmètre de chacun : elles n'ont pas de déclarant, et c'est justement le cas le plus
          courant. Un test l'a montré avant la mise en service.
        */
        OR: [{ declarant_user_id: null }, { declarant_user_id: { not: u.id } }],
      },
    ],
  }
}

export function clauseNonAffectes(
  couverture: Map<ParcoursCode, CouvertureParcours>
): Prisma.dossiersWhereInput {
  const orphelinsParType = [...couverture.entries()].map(([code, couvert]) => {
    const couvrants: Prisma.dossiersWhereInput[] = []
    if (couvert.directions.length > 0) {
      couvrants.push({ direction_id: { in: [...couvert.directions] } })
    }
    if (couvert.sites.length > 0) {
      couvrants.push({ site_id: { in: [...couvert.sites] } })
    }

    // `id: { in: [] }` est une clause impossible, et c'est voulu : aucun dossier de ce type n'est
    // orphelin dès qu'un traitant sans rattachement les couvre tous.
    const horsPortee: Prisma.dossiersWhereInput = couvert.toutCouvert
      ? { id: { in: [] } }
      : couvrants.length === 0
        ? {}
        : { NOT: { OR: couvrants } }

    return { parcours: { code }, ...horsPortee }
  })

  return {
    statuts_dossier: { code: 'recu' },
    // Une affectation ACTIVE suffit à dire que quelqu'un l'a — il n'en est plus écrit de
    // nouvelles, mais les anciennes valent toujours.
    dossier_affectations: { none: { actif: true } },
    OR: orphelinsParType,
  }
}

/**
 * EX-GES-01 : liste des dossiers, filtrable
 *
 * ⚠️ Le périmètre ci-dessous DOIT refléter exactement `peutVoirDossier()` : ne jamais faire
 * apparaître dans une liste un dossier que la policy refuserait à l'unité. Un test croise les
 * deux implémentations pour garantir qu'elles ne divergent pas.
 */

/** Clause `where` correspondant au périmètre visible par cet utilisateur. */
export function perimetreDossiers(u: UtilisateurAutorise): Prisma.dossiersWhereInput {
  // Un employé déclarant ne voit QUE ses propres dossiers non anonymes : un dossier anonyme
  // n'est rattaché à personne, même si son auteur était connecté (RG-06).
  // Coché sur le rôle depuis le 2026-09-21 — voir `peutVoirDossier()`, qui dit la même chose.
  if (u.voitSeulementSesDeclarations) {
    return { declarant_user_id: u.id, is_anonymous: false }
  }

  /*
    ⚠️ « Tous les dossiers » veut dire « tous ceux de ses TYPES », pas tous sans exception : le
    type est la borne extérieure, et ce droit lève le rattachement et l'appartenance, jamais lui.
    Rendre une clause vide ici ferait des cases de types un leurre.
  */
  if (aPermission(u, 'dossiers.view.all')) {
    return { parcours: { code: { in: parcoursAutorises(u) } } }
  }

  /*
    Cloisonnement par RATTACHEMENT, traduit en SQL comme dans `peutVoirDossier()`. Un dossier sans
    le découpage contrôlé n'est retenu par aucune de ces clauses : c'est voulu.

    ⚠️ LES DEUX NE S'APPLIQUENT JAMAIS ENSEMBLE : `siteCloisonnant()` rend `null` dès qu'une
    direction borne le compte. Les additionner refuserait des dossiers légitimes — celui d'une
    direction sans site serait rejeté par le contrôle de site alors que sa direction correspond.
  */
  const direction = directionCloisonnante(u)
  const site = siteCloisonnant(u)
  const parRattachement: Prisma.dossiersWhereInput =
    direction !== null ? { direction_id: direction } : site === null ? {} : { site_id: site }

  if (aPermission(u, 'dossiers.view')) {
    return { ...parRattachement, parcours: { code: { in: parcoursAutorises(u) } } }
  }

  // `dossiers.view.own` : SES dossiers, pas tout son parcours. Traduction en SQL de la branche
  // correspondante de `peutVoirDossier()` — les deux doivent dire exactement la même chose, et
  // un test croise les deux implémentations dossier par dossier.
  if (aPermission(u, 'dossiers.view.own')) {
    return {
      ...parRattachement,
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
        in: STATUTS.filter((statut) => peutFaireAvancerDepuis(u, parcours, statut)).filter(
          (statut) => transitionsDepuis(statut).length > 0
        ),
      },
    },
  }))

  return branches.length === 0 ? { id: { in: [] } } : { OR: branches }
}

function clauseFiltres(
  u: UtilisateurAutorise,
  filtres: FiltresDossiers,
  /** Chargée seulement quand `nonAffectes` est demandé : une requête de plus, sinon inutile. */
  couverture?: Map<ParcoursCode, CouvertureParcours>
): Prisma.dossiersWhereInput {
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
    // Une seule définition, partagée avec la carte du tableau de bord. Voir `clauseDontJeReponds`.
    Object.assign(where, clauseDontJeReponds(u))
  }

  if (filtres.aMoiDAgir) {
    where.AND = [clauseAMoiDAgir(u)]
  }

  if (filtres.nonAffectes && couverture !== undefined) {
    // Une seule définition, partagée avec le compteur du tableau de bord. Voir `clauseNonAffectes`.
    Object.assign(where, clauseNonAffectes(couverture))
  }

  return where
}

const PAR_PAGE = 20

export async function listerDossiers(
  u: UtilisateurAutorise,
  filtres: FiltresDossiers = {},
  page = 1
) {
  // Une requête de plus, et seulement quand le filtre la réclame : savoir quels EI n'ont personne
  // suppose de connaître les chargés de sécurité, ce qui n'intéresse aucun autre filtre.
  const couverture = filtres.nonAffectes ? await couvertureParParcours() : undefined

  const where: Prisma.dossiersWhereInput = {
    AND: [perimetreDossiers(u), clauseFiltres(u, filtres, couverture)],
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
        // Remonté au même titre que `site_id`, et pour la même raison : ce sont les deux
        // entrées du cloisonnement par rattachement, et le test qui croise ce périmètre avec
        // `peutVoirDossier()` doit pouvoir lui passer exactement ce que la policy regarde.
        direction_id: true,
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
 * Plusieurs catégories portent le même libellé d'un parcours à l'autre — « Autre » existe quatre
 * fois. Le parcours est donc accolé au libellé tant qu'aucun n'est choisi ; il disparaît ensuite.
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
