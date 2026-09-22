import { Prisma } from '@prisma/client'
import {
  directionCloisonnante,
  parcoursAutorises,
  siteCloisonnant,
  type ParcoursCode,
  type UtilisateurAutorise,
} from '@/server/authz'

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
  /**
   * Parcours que le LECTEUR a le droit de voir. `undefined` = aucune restriction.
   *
   * ⚠️ Ce n'est pas un critère de recherche, c'est un plafond. Il n'est jamais lu depuis l'URL —
   * seul `filtreDepuisParametres()` le pose, d'après les rôles du lecteur — et il se COMBINE aux
   * autres critères au lieu de s'y substituer : demander un parcours hors de son périmètre ne
   * l'ouvre pas, cela ne renvoie rien.
   *
   * Le reporting l'ignorait entièrement. Tant que `reporting.view` n'était porté que par des
   * rôles transverses, l'omission restait sans effet ; le jour où il a été accordé à un rôle
   * cloisonné, celui-ci s'est mis à lire les volumes de tous les parcours — alors que sa liste de
   * dossiers, elle, continuait de n'en montrer qu'un.
   */
  readonly parcoursDuLecteur?: readonly ParcoursCode[]
  /**
   * Site auquel le LECTEUR est borné. `undefined`/`null` = pas de restriction de site.
   *
   * ⚠️ Même nature que `parcoursDuLecteur` : un plafond, jamais un critère de recherche. Ne pas
   * confondre avec `siteId`, qui vient de l'URL et que l'utilisateur choisit.
   *
   * Le parcours était plafonné, le rattachement ne l'était pas : un lecteur cloisonné par site
   * aurait lu les volumes de tous les sites, alors que sa liste de dossiers n'en montre qu'un.
   * C'est exactement le défaut qui avait été corrigé pour le parcours, laissé ouvert à côté.
   */
  readonly siteDuLecteur?: bigint | null
  /** Direction à laquelle le lecteur est borné. Plus fine que le site, et prioritaire sur lui. */
  readonly directionDuLecteur?: bigint | null
}

export const FILTRE_VIDE: FiltreReporting = {}

/**
 * Traduit le filtre en clause Prisma.
 *
 * La borne de fin compare des DATES, donc elle inclut
 * toute la journée. Un `lte` sur un timestamp exclurait au contraire tout ce qui a été soumis
 * après minuit. La borne haute est donc portée à la fin de journée pour conserver ce sens.
 */
export function clauseFiltre(filtre: FiltreReporting): Prisma.dossiersWhereInput {
  const clause: Prisma.dossiersWhereInput = {}

  if (filtre.parcoursId != null) clause.parcours_id = filtre.parcoursId

  // Le plafond du lecteur s'ajoute aux critères, il ne les remplace pas. Un `in: []` est une
  // clause impossible, et c'est voulu : un rôle sans parcours ne compte rien, plutôt que de
  // retomber par défaut sur « tout voir ».
  if (filtre.parcoursDuLecteur !== undefined) {
    clause.parcours = { code: { in: [...filtre.parcoursDuLecteur] } }
  }
  /*
    Le plafond de RATTACHEMENT, posé avant les critères pour qu'un `siteId` venu de l'URL ne
    puisse jamais l'élargir : les deux écrivent la même clé, et c'est le critère qui doit être
    écrasé par le plafond, pas l'inverse.

    La direction l'emporte sur le site, comme dans `rattachementCouvre()` : les appliquer ensemble
    exclurait les dossiers d'une direction sans site.
  */
  if (filtre.directionDuLecteur != null) {
    clause.direction_id = filtre.directionDuLecteur
  } else if (filtre.siteDuLecteur != null) {
    clause.site_id = filtre.siteDuLecteur
  }

  if (filtre.categorieId != null) clause.categorie_id = filtre.categorieId
  if (filtre.statutId != null) clause.statut_id = filtre.statutId
  if (filtre.niveauGraviteId != null) clause.niveau_gravite_id = filtre.niveauGraviteId
  // Critères venus de l'URL : ils ne s'appliquent que s'ils ne contredisent pas le plafond.
  if (filtre.siteId != null && clause.site_id === undefined) clause.site_id = filtre.siteId
  if (filtre.directionId != null && clause.direction_id === undefined) {
    clause.direction_id = filtre.directionId
  }

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
  parametres: Record<string, string | string[] | undefined>,
  /**
   * Le lecteur, dont le périmètre plafonne le résultat.
   *
   * Optionnel pour les appels qui n'ont pas de lecteur — une tâche planifiée, un test. Omis, le
   * filtre ne plafonne rien : c'est le comportement d'avant, et il ne doit subsister que là où
   * personne ne lit.
   */
  lecteur?: UtilisateurAutorise
): FiltreReporting {
  return {
    parcoursDuLecteur: lecteur ? parcoursAutorises(lecteur) : undefined,
    // Les MÊMES fonctions que celles qui bornent la liste et la fiche.
    siteDuLecteur: lecteur ? siteCloisonnant(lecteur) : undefined,
    directionDuLecteur: lecteur ? directionCloisonnante(lecteur) : undefined,
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
