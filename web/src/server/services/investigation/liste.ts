import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parcoursAutorises, type UtilisateurAutorise } from '@/server/authz'
import { STATUTS_INVESTIGATION, type StatutInvestigation } from './investigation'

/**
 * Vue transverse des investigations, tous dossiers confondus — port de
 * `App\Livewire\Investigations\InvestigationListPage`.
 *
 * ⚠️ Le cloisonnement par parcours est poussé DANS la requête SQL, avant pagination. Filtrer en
 * mémoire après lecture donnerait des pages incomplètes — et, plus grave, ferait transiter par le
 * serveur des lignes hors périmètre.
 */

export function perimetreInvestigations(u: UtilisateurAutorise): Prisma.investigationsWhereInput {
  const codes = parcoursAutorises(u.roles)

  // `in: []` est une clause impossible, et c'est voulu : un rôle sans parcours ne voit rien,
  // plutôt que de retomber par défaut sur « tout voir ».
  return { dossiers: { parcours: { code: { in: codes } } } }
}

export type FiltresInvestigations = {
  statut?: string
  enqueteurId?: string
  parcoursId?: string
  periodeDebut?: string
  periodeFin?: string
  /** Raccourci de navigation : les investigations dont je suis l'enquêteur. */
  miennes?: boolean
}

function clauseFiltres(
  u: UtilisateurAutorise,
  filtres: FiltresInvestigations
): Prisma.investigationsWhereInput {
  const where: Prisma.investigationsWhereInput = {}

  // Le statut vient de l'URL : le valider contre la liste close évite qu'une valeur fantaisiste
  // produise silencieusement une liste vide, que l'utilisateur lirait comme « aucune donnée ».
  if (filtres.statut && (STATUTS_INVESTIGATION as readonly string[]).includes(filtres.statut)) {
    where.statut = filtres.statut
  }

  if (filtres.miennes) {
    where.enqueteur_id = u.id
  } else if (filtres.enqueteurId) {
    where.enqueteur_id = BigInt(filtres.enqueteurId)
  }

  if (filtres.parcoursId) {
    where.dossiers = { parcours_id: BigInt(filtres.parcoursId) }
  }

  if (filtres.periodeDebut || filtres.periodeFin) {
    where.date_ouverture = {
      ...(filtres.periodeDebut ? { gte: new Date(filtres.periodeDebut) } : {}),
      ...(filtres.periodeFin ? { lte: new Date(`${filtres.periodeFin}T23:59:59.999`) } : {}),
    }
  }

  return where
}

const PAR_PAGE = 20

export async function listerInvestigations(
  u: UtilisateurAutorise,
  filtres: FiltresInvestigations = {},
  page = 1
) {
  const where: Prisma.investigationsWhereInput = {
    AND: [perimetreInvestigations(u), clauseFiltres(u, filtres)],
  }

  const [total, investigations] = await Promise.all([
    prisma.investigations.count({ where }),
    prisma.investigations.findMany({
      where,
      orderBy: { date_ouverture: 'desc' },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
      select: {
        id: true,
        date_ouverture: true,
        statut: true,
        users_investigations_enqueteur_idTousers: { select: { name: true } },
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

  return {
    investigations,
    total,
    page,
    parPage: PAR_PAGE,
    pages: Math.max(1, Math.ceil(total / PAR_PAGE)),
  }
}

/** Référentiels alimentant les listes déroulantes de filtres. */
export async function referentielsInvestigations() {
  const [parcours, enqueteurs] = await Promise.all([
    prisma.parcours.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle: true },
    }),
    // Les enquêteurs proposés sont ceux qui en ont réellement mené une : proposer les 6 000
    // comptes actifs ferait une liste déroulante inutilisable, dont 99 % des entrées ne
    // ramèneraient rien.
    prisma.users.findMany({
      where: { investigations_investigations_enqueteur_idTousers: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return { parcours, enqueteurs }
}

export const LIBELLES_STATUT_INVESTIGATION: Record<StatutInvestigation, string> = {
  en_cours: 'En cours',
  en_attente_validation: 'En attente de validation',
  validee: 'Validée',
}
