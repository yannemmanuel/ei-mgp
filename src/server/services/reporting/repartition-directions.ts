import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parcoursAutorises, type ParcoursCode, type UtilisateurAutorise } from '@/server/authz'
import { DIRECTION_NON_RENSEIGNEE, perimetreDossiers } from '../dossier/liste'
import { clauseFiltre, type FiltreReporting } from './filtre'

/**
 * Progression des déclarations par DIRECTION CONCERNÉE, pour le tableau de bord.
 *
 * ⚠️ LE PÉRIMÈTRE EST CELUI DE LA LISTE DES DOSSIERS (`perimetreDossiers()`), pas le seul plafond
 * du reporting. Chacun ne compte que les déclarations qu'il peut ouvrir selon son habilitation —
 * un compte `dossiers.view.own` ses seuls dossiers, un compte borné à une direction cette seule
 * direction. Un chiffre que la liste ne permettrait pas de retrouver serait une fuite, ou un
 * mensonge.
 *
 * Chaque direction est découpée en ÉTAPES de traitement, dans l'ordre du circuit : c'est ce qui
 * dit où le travail s'accumule, et pas seulement combien il y en a.
 */

/** Étapes regroupant les statuts, dans l'ordre du circuit. */
export const ETAPES = [
  { cle: 'a_instruire', libelle: 'À instruire' },
  { cle: 'investigation', libelle: 'En investigation' },
  { cle: 'action_corrective', libelle: 'Action corrective' },
  { cle: 'resolu', libelle: 'Résolu' },
  { cle: 'clos', libelle: 'Clos' },
] as const

export type CleEtape = (typeof ETAPES)[number]['cle']

/**
 * Statut → étape. Un statut inconnu (l'ancien « Affecté », désactivé) retombe sur « À instruire » :
 * le dossier n'a pas encore été instruit, le taire fausserait le total.
 */
const ETAPE_DU_STATUT: Record<string, CleEtape> = {
  recu: 'a_instruire',
  en_analyse: 'a_instruire',
  reouvert: 'a_instruire',
  en_investigation: 'investigation',
  en_attente_information: 'investigation',
  action_corrective_en_cours: 'action_corrective',
  resolu: 'resolu',
  cloture: 'clos',
  rejete: 'clos',
}

export type Etapes = Record<CleEtape, number>

export type LigneDirection = {
  /** Identifiant, ou `DIRECTION_NON_RENSEIGNEE` : sert le lien vers la liste filtrée. */
  cle: string
  libelle: string
  total: number
  etapes: Etapes
  /** Non clos : tout ce qui n'a pas atteint un statut terminal. */
  ouverts: number
  /** Dossiers ouverts dont la gravité déclenche le circuit accéléré. */
  critiquesOuverts: number
  actionsEnRetard: number
}

export type ProgressionDirections = {
  lignes: LigneDirection[]
  /** Somme de toutes les directions : la progression globale. */
  global: Omit<LigneDirection, 'cle' | 'libelle'>
}

const etapesVides = (): Etapes => ({
  a_instruire: 0,
  investigation: 0,
  action_corrective: 0,
  resolu: 0,
  clos: 0,
})

/** Part traitée : résolus et clos sur le total. `null` sur un ensemble vide. */
export function avancement(l: { total: number; etapes: Etapes }): number | null {
  return l.total === 0 ? null : Math.round(((l.etapes.resolu + l.etapes.clos) / l.total) * 100)
}

export async function progressionParDirection(
  lecteur: UtilisateurAutorise,
  options: {
    /** Critères du tableau de bord. Absent pour un lecteur sans `reporting.view`. */
    filtre?: FiltreReporting
    /**
     * Restreint à un parcours. Ignoré s'il n'est pas dans le périmètre du lecteur : un parcours
     * demandé hors habilitation ne l'ouvre pas, il est simplement sans effet.
     */
    parcours?: ParcoursCode | null
  } = {}
): Promise<ProgressionDirections> {
  const clauses: Prisma.dossiersWhereInput[] = [perimetreDossiers(lecteur)]

  if (options.filtre) clauses.push(clauseFiltre(options.filtre))
  if (options.parcours && parcoursAutorises(lecteur).includes(options.parcours)) {
    clauses.push({ parcours: { code: options.parcours } })
  }

  const where: Prisma.dossiersWhereInput = { AND: clauses }

  const [groupes, statuts, gravites, actionsEnRetard] = await Promise.all([
    // Tout reste agrégé par la base : jamais les dossiers chargés en mémoire pour les compter.
    prisma.dossiers.groupBy({
      by: ['direction_id', 'statut_id', 'niveau_gravite_id'],
      where,
      _count: { _all: true },
    }),
    prisma.statuts_dossier.findMany({ select: { id: true, code: true, is_terminal: true } }),
    prisma.niveaux_gravite.findMany({ select: { id: true, effet_circuit: true } }),
    // Seules les actions EN RETARD sont lues, et seule leur direction : un volume borné.
    prisma.actions_correctives.findMany({
      where: { statut: 'en_retard', dossiers: where },
      select: { dossiers: { select: { direction_id: true } } },
    }),
  ])

  const statutParId = new Map(statuts.map((s) => [s.id, s]))
  const critique = new Set(
    gravites.filter((g) => g.effet_circuit === 'accelere').map((g) => g.id)
  )

  const parDirection = new Map<string, Omit<LigneDirection, 'cle' | 'libelle'>>()
  const ligne = (directionId: bigint | null) => {
    const cle = directionId === null ? DIRECTION_NON_RENSEIGNEE : String(directionId)
    let courante = parDirection.get(cle)

    if (!courante) {
      courante = { total: 0, etapes: etapesVides(), ouverts: 0, critiquesOuverts: 0, actionsEnRetard: 0 }
      parDirection.set(cle, courante)
    }

    return courante
  }

  for (const g of groupes) {
    const courante = ligne(g.direction_id)
    const statut = statutParId.get(g.statut_id)
    const nombre = g._count._all

    courante.total += nombre
    courante.etapes[ETAPE_DU_STATUT[statut?.code ?? ''] ?? 'a_instruire'] += nombre

    if (!statut?.is_terminal) {
      courante.ouverts += nombre
      if (g.niveau_gravite_id !== null && critique.has(g.niveau_gravite_id)) {
        courante.critiquesOuverts += nombre
      }
    }
  }

  for (const action of actionsEnRetard) {
    ligne(action.dossiers.direction_id).actionsEnRetard += 1
  }

  const identifiants = [...parDirection.keys()]
    .filter((cle) => cle !== DIRECTION_NON_RENSEIGNEE)
    .map((cle) => BigInt(cle))
  const directions = await prisma.directions.findMany({
    where: { id: { in: identifiants } },
    select: { id: true, libelle: true },
  })
  const libelles = new Map(directions.map((d) => [String(d.id), d.libelle]))

  const lignes = [...parDirection.entries()]
    .map(([cle, valeurs]) => ({
      cle,
      libelle:
        cle === DIRECTION_NON_RENSEIGNEE ? 'Non renseignée' : (libelles.get(cle) ?? '—'),
      ...valeurs,
    }))
    .sort(
      (a, b) =>
        // Ce qui demande une décision d'abord : les critiques, puis le stock ouvert, puis le volume.
        b.critiquesOuverts - a.critiquesOuverts ||
        b.ouverts - a.ouverts ||
        b.total - a.total ||
        a.libelle.localeCompare(b.libelle, 'fr')
    )

  const global = { total: 0, etapes: etapesVides(), ouverts: 0, critiquesOuverts: 0, actionsEnRetard: 0 }
  for (const l of lignes) {
    global.total += l.total
    global.ouverts += l.ouverts
    global.critiquesOuverts += l.critiquesOuverts
    global.actionsEnRetard += l.actionsEnRetard
    for (const { cle } of ETAPES) global.etapes[cle] += l.etapes[cle]
  }

  return { lignes, global }
}

/** Parcours du lecteur, dans l'ordre du référentiel : les onglets du graphique. */
export async function parcoursDuLecteur(lecteur: UtilisateurAutorise) {
  return prisma.parcours.findMany({
    where: { code: { in: [...parcoursAutorises(lecteur)] }, actif: true },
    orderBy: { ordre: 'asc' },
    select: { code: true, libelle: true },
  })
}
