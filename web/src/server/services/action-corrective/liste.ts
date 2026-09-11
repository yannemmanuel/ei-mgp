import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parcoursAutorises, type UtilisateurAutorise } from '@/server/authz'
import { STATUTS_ACTION, type StatutAction } from './action-corrective'

/**
 * Vue transverse des actions correctives, tous dossiers confondus — port de
 * `App\Livewire\ActionsCorrectives\ActionCorrectiveListPage`.
 *
 * Même règle que pour les investigations : le cloisonnement par parcours est poussé en SQL avant
 * pagination, jamais appliqué après lecture.
 *
 * ⚠️ `en_retard` est une colonne recalculée par la tâche planifiée `detecter-retards`, pas une
 * comparaison faite à la lecture. Une action qui vient de dépasser son échéance peut donc porter
 * encore `en_cours` jusqu'au prochain passage. L'écran affiche pour cette raison les jours
 * restants calculés à l'instant du rendu, qui eux ne retardent pas.
 */

export function perimetreActions(u: UtilisateurAutorise): Prisma.actions_correctivesWhereInput {
  return { dossiers: { parcours: { code: { in: parcoursAutorises(u) } } } }
}

export type FiltresActions = {
  statut?: string
  responsableId?: string
  parcoursId?: string
  echeanceDebut?: string
  echeanceFin?: string
  /** Raccourci de navigation : les actions dont je suis responsable. */
  miennes?: boolean
}

function clauseFiltres(
  u: UtilisateurAutorise,
  filtres: FiltresActions
): Prisma.actions_correctivesWhereInput {
  const where: Prisma.actions_correctivesWhereInput = {}

  if (filtres.statut && (STATUTS_ACTION as readonly string[]).includes(filtres.statut)) {
    where.statut = filtres.statut
  }

  if (filtres.miennes) {
    where.responsable_id = u.id
  } else if (filtres.responsableId) {
    where.responsable_id = BigInt(filtres.responsableId)
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
    AND: [perimetreActions(u), clauseFiltres(u, filtres)],
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
  const [parcours, responsables] = await Promise.all([
    prisma.parcours.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle: true },
    }),
    prisma.users.findMany({
      where: { actions_correctives: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return { parcours, responsables }
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
