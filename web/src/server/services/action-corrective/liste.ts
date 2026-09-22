import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { UtilisateurAutorise } from '@/server/authz'
import { perimetreDossiers } from '../dossier/liste'
import { STATUTS_ACTION, type StatutAction } from './action-corrective'

/**
 * Vue transverse des actions correctives, tous dossiers confondus
 *
 * Même règle que pour les investigations : le cloisonnement par parcours est poussé en SQL avant
 * pagination, jamais appliqué après lecture.
 *
 * ⚠️ `en_retard` est une colonne recalculée par la tâche planifiée `detecter-retards`, pas une
 * comparaison faite à la lecture. Une action qui vient de dépasser son échéance peut donc porter
 * encore `en_cours` jusqu'au prochain passage. L'écran affiche pour cette raison les jours
 * restants calculés à l'instant du rendu, qui eux ne retardent pas.
 */

/**
 * ⚠️ LE PÉRIMÈTRE DE LA FICHE, REPRIS TEL QUEL — et surtout pas redérivé.
 *
 * Même défaut que pour les investigations : filtrer sur le seul parcours laissait voir ici des
 * actions dont le dossier était refusé à la lecture, avec la référence du dossier en clair et un
 * lien qui menait à « Page introuvable ». Déléguer supprime la possibilité même d'un écart.
 * `perimetres-coherents.test.ts` le vérifie sur les comptes réels.
 */
export function perimetreActions(u: UtilisateurAutorise): Prisma.actions_correctivesWhereInput {
  return { dossiers: perimetreDossiers(u) }
}

/**
 * ⚠️ `miennes` A DISPARU, et ce n'est pas un oubli.
 *
 * Le responsable d'une action est saisi à la main depuis le 2026-09-18 : ce n'est plus un compte,
 * et l'application ne sait donc plus quelles actions appartiennent à qui. Un raccourci « Les
 * miennes » ne ramènerait que les actions écrites AVANT ce changement, en se présentant comme une
 * liste complète — c'est-à-dire en cachant du travail à la personne qui en est chargée.
 *
 * Le filtre par responsable, lui, subsiste : il porte sur le nom saisi.
 */
export type FiltresActions = {
  statut?: string
  responsable?: string
  parcoursId?: string
  echeanceDebut?: string
  echeanceFin?: string
}

function clauseFiltres(filtres: FiltresActions): Prisma.actions_correctivesWhereInput {
  const where: Prisma.actions_correctivesWhereInput = {}

  if (filtres.statut && (STATUTS_ACTION as readonly string[]).includes(filtres.statut)) {
    where.statut = filtres.statut
  }

  if (filtres.responsable) {
    where.responsable_nom = filtres.responsable
  }

  if (filtres.parcoursId) {
    where.dossiers = { parcours_id: BigInt(filtres.parcoursId) }
  }

  if (filtres.echeanceDebut || filtres.echeanceFin) {
    where.echeance = {
      ...(filtres.echeanceDebut ? { gte: new Date(filtres.echeanceDebut) } : {}),
      ...(filtres.echeanceFin ? { lte: new Date(`${filtres.echeanceFin}T23:59:59.999`) } : {}),
    }
  }

  return where
}

const PAR_PAGE = 20

export async function listerActions(
  u: UtilisateurAutorise,
  filtres: FiltresActions = {},
  page = 1
) {
  const where: Prisma.actions_correctivesWhereInput = {
    // ⚠️ `perimetreActions(u)` reste le premier terme : c'est LUI qui cloisonne. Les filtres ne
    // font que restreindre à l'intérieur de ce périmètre, jamais l'élargir.
    AND: [perimetreActions(u), clauseFiltres(filtres)],
  }

  const [total, actions] = await Promise.all([
    prisma.actions_correctives.count({ where }),
    prisma.actions_correctives.findMany({
      where,
      // L'échéance la plus proche en tête : c'est un écran de travail, pas un journal.
      orderBy: { echeance: 'asc' },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
      select: {
        id: true,
        intitule: true,
        echeance: true,
        statut: true,
        date_cloture: true,
        responsable_nom: true,
        // Conservée pour les actions créées avant la saisie manuelle, qui désignaient un compte.
        users: { select: { name: true } },
        dossiers: {
          select: {
            id: true,
            reference: true,
            parcours: { select: { libelle: true } },
            categories: { select: { libelle: true } },
          },
        },
      },
    }),
  ])

  return { actions, total, page, parPage: PAR_PAGE, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) }
}

export async function referentielsActions() {
  /*
    Les responsables proposés sont les noms RÉELLEMENT SAISIS, et non plus la liste des comptes.
    Même règle qu'avant le changement : ne proposer que des valeurs qui ramènent des lignes. Lire
    `users` continuerait d'offrir des comptes dont plus aucune action ne porte le nom.
  */
  const [parcours, responsables] = await Promise.all([
    prisma.parcours.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle: true },
    }),
    prisma.actions_correctives.findMany({
      where: { responsable_nom: { not: null } },
      distinct: ['responsable_nom'],
      orderBy: { responsable_nom: 'asc' },
      select: { responsable_nom: true },
    }),
  ])

  return {
    parcours,
    responsables: responsables
      .map((a) => a.responsable_nom)
      .filter((nom): nom is string => nom !== null),
  }
}

export const LIBELLES_STATUT_ACTION: Record<StatutAction, string> = {
  non_demarree: 'Non démarrée',
  en_cours: 'En cours',
  realisee: 'Réalisée',
  en_retard: 'En retard',
}

/**
 * Jours restants avant l'échéance — négatif si elle est dépassée.
 *
 * Même normalisation à minuit locale que `dossier/delais.ts` et que `recalculerRetards()` : trois
 * définitions différentes de « aujourd'hui » finiraient par afficher un décompte que la tâche
 * planifiée contredit.
 */
export function joursAvantEcheance(echeance: Date, maintenant = new Date()): number {
  const debutJour = (d: Date) => {
    const copie = new Date(d)
    copie.setHours(0, 0, 0, 0)
    return copie.getTime()
  }

  return Math.round((debutJour(echeance) - debutJour(maintenant)) / 86_400_000)
}
