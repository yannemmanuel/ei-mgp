import type { Prisma } from '@prisma/client'

/**
 * EX-REP-02 : filtre unique du module Reporting — port de `App\Support\ReportingFilter`.
 *
 * Le même objet alimente le tableau de bord, le calcul des indicateurs et les exports. C'est
 * délibéré : si l'export appliquait sa propre traduction des filtres, un rapport exporté pourrait
 * ne pas correspondre à ce que l'écran affiche, et l'écart serait indétectable.
 *
 * Sur-ensemble des filtres du module Dossiers : ajoute site et direction.
 */
export type FiltreReporting = {
  readonly parcoursId?: bigint | null
  readonly categorieId?: bigint | null
  readonly statutId?: bigint | null
  readonly niveauGraviteId?: bigint | null
  readonly siteId?: bigint | null
  readonly directionId?: bigint | null
  /** Bornes incluses, sur la date de soumission. */
  readonly periodeDebut?: Date | null
  readonly periodeFin?: Date | null
}

export const FILTRE_VIDE: FiltreReporting = {}

/**
 * Traduit le filtre en clause Prisma.
 *
 * `whereDate(created_at, '<=', fin)` côté Laravel compare des DATES : la borne de fin y inclut
 * toute la journée. Un `lte` sur un timestamp exclurait au contraire tout ce qui a été soumis
 * après minuit. La borne haute est donc portée à la fin de journée pour conserver ce sens.
 */
export function clauseFiltre(filtre: FiltreReporting): Prisma.dossiersWhereInput {
  const clause: Prisma.dossiersWhereInput = {}

  if (filtre.parcoursId != null) clause.parcours_id = filtre.parcoursId
  if (filtre.categorieId != null) clause.categorie_id = filtre.categorieId
  if (filtre.statutId != null) clause.statut_id = filtre.statutId
  if (filtre.niveauGraviteId != null) clause.niveau_gravite_id = filtre.niveauGraviteId
  if (filtre.siteId != null) clause.site_id = filtre.siteId
  if (filtre.directionId != null) clause.direction_id = filtre.directionId

  if (filtre.periodeDebut != null || filtre.periodeFin != null) {
    clause.created_at = {}

    if (filtre.periodeDebut != null) {
      clause.created_at.gte = debutDeJournee(filtre.periodeDebut)
    }

    if (filtre.periodeFin != null) {
      clause.created_at.lte = finDeJournee(filtre.periodeFin)
    }
  }

  return clause
}

function debutDeJournee(date: Date): Date {
  const copie = new Date(date)
  copie.setHours(0, 0, 0, 0)
  return copie
}

function finDeJournee(date: Date): Date {
  const copie = new Date(date)
  copie.setHours(23, 59, 59, 999)
  return copie
}

/** Lecture d'un filtre depuis des paramètres d'URL — valeurs invalides ignorées, jamais fatales. */
export function filtreDepuisParametres(
  parametres: Record<string, string | string[] | undefined>
): FiltreReporting {
  return {
    parcoursId: entier(parametres.parcoursId),
    categorieId: entier(parametres.categorieId),
    statutId: entier(parametres.statutId),
    niveauGraviteId: entier(parametres.niveauGraviteId),
    siteId: entier(parametres.siteId),
    directionId: entier(parametres.directionId),
    periodeDebut: date(parametres.periodeDebut),
    periodeFin: date(parametres.periodeFin),
  }
}

function premiere(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

function entier(valeur: string | string[] | undefined): bigint | null {
  const brut = premiere(valeur)
  if (!brut || !/^\d+$/.test(brut)) return null

  return BigInt(brut)
}

function date(valeur: string | string[] | undefined): Date | null {
  const brut = premiere(valeur)
  if (!brut) return null

  const analysee = new Date(brut)
  return Number.isNaN(analysee.getTime()) ? null : analysee
}
