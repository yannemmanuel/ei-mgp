import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { UtilisateurAutorise } from '@/server/authz'
import { perimetreDossiers } from '../dossier/liste'

/**
 * Vue transverse des investigations, tous dossiers confondus — port de
 * `App\Livewire\Investigations\InvestigationListPage`.
 *
 * ⚠️ Le cloisonnement par parcours est poussé DANS la requête SQL, avant pagination. Filtrer en
 * mémoire après lecture donnerait des pages incomplètes — et, plus grave, ferait transiter par le
 * serveur des lignes hors périmètre.
 */

/**
 * ⚠️ LE PÉRIMÈTRE DE LA FICHE, REPRIS TEL QUEL — et surtout pas redérivé.
 *
 * Cette fonction ne filtrait que sur le PARCOURS. Il lui manquait le cloisonnement par site, et
 * les deux règles divergeaient donc : un chargé de sécurité rattaché à un site voyait ici des
 * fiches dont le dossier lui était refusé. Deux conséquences, la seconde étant la grave :
 *
 *   1. il cliquait sur la ligne et tombait sur « Page introuvable » ;
 *   2. la ligne lui avait DÉJÀ montré la référence du dossier, sa catégorie et le nom de
 *      l'enquêteur — d'un dossier qu'il n'a pas le droit de lire.
 *
 * Déléguer est la seule façon de garantir que les deux ne peuvent plus diverger : il n'y a plus
 * qu'une définition du périmètre, celle qui décide aussi de l'ouverture de la fiche.
 * `perimetres-coherents.test.ts` le vérifie sur les comptes réels.
 */
export function perimetreInvestigations(u: UtilisateurAutorise): Prisma.investigationsWhereInput {
  return { dossiers: perimetreDossiers(u) }
}

/**
 * ⚠️ `statut` A DISPARU des filtres : une investigation n'est soumise à aucune validation
 * (décision métier du 2026-09-18). La colonne ne porte plus qu'une valeur unique — un filtre
 * dessus n'offrirait qu'un seul choix, qui ne retirerait jamais aucune ligne.
 *
 * « Où en est le DOSSIER » (`statutDossierId`) reste, et c'est celui qui renseigne vraiment.
 */
export type FiltresInvestigations = {
  enqueteurId?: string
  parcoursId?: string
  /** Statut du DOSSIER — désormais le seul statut qui existe pour une investigation. */
  statutDossierId?: string
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

  if (filtres.miennes) {
    where.enqueteur_id = u.id
  } else if (filtres.enqueteurId) {
    where.enqueteur_id = BigInt(filtres.enqueteurId)
  }

  // ⚠️ Les deux filtres portent sur la MÊME relation : les écrire l'un après l'autre dans
  // `where.dossiers` ferait perdre le premier. Ils s'accumulent donc dans un seul objet.
  const surLeDossier: Prisma.dossiersWhereInput = {}
  if (filtres.parcoursId) surLeDossier.parcours_id = BigInt(filtres.parcoursId)
  if (filtres.statutDossierId) surLeDossier.statut_id = BigInt(filtres.statutDossierId)
  if (Object.keys(surLeDossier).length > 0) where.dossiers = surLeDossier

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
        users_investigations_enqueteur_idTousers: { select: { name: true } },
        dossiers: {
          select: {
            id: true,
            reference: true,
            parcours: { select: { libelle: true } },
            categories: { select: { libelle: true } },
            // Le seul statut que l'écran affiche désormais : celui du DOSSIER.
            statuts_dossier: { select: { code: true, libelle_interne: true } },
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
  const [parcours, enqueteurs, statutsDossier] = await Promise.all([
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
    // Même règle : seuls les statuts qu'un dossier sous investigation porte réellement. Proposer
    // les dix statuts en offrirait huit qui ne ramènent rien.
    prisma.statuts_dossier.findMany({
      where: { dossiers: { some: { investigations: { some: {} } } } },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle_interne: true },
    }),
  ])

  return { parcours, enqueteurs, statutsDossier }
}
