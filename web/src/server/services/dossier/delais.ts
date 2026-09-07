import { prisma } from '@/lib/prisma'
import type { StatutCode } from './statuts'

/**
 * Suivi des délais maximaux par étape (CDC §11.2) — port de
 * `App\Services\Workflow\DelaiService`.
 *
 * Socle commun à l'affichage d'échéance (Module 2) et aux relances/alertes (Module 5,
 * EX-NOT-03/04) : les deux s'appuient sur le même calcul, jamais sur deux implémentations
 * séparées du même délai.
 *
 * Le CDC §6 (processus) et §7.1 (statuts internes) n'ont pas la même granularité : « Retour
 * d'information au plaignant » n'a pas de statut dédié (il se produit pendant « En
 * investigation »), il n'est donc volontairement pas suivi comme une échéance autonome.
 * « Clôture » est traitée comme un délai global (création → clôture), pas comme une sous-étape.
 */

export type EtapeDelai =
  | 'analyse_preliminaire'
  | 'traitement_enquete'
  | 'retour_information'
  | 'mise_en_oeuvre_mesures'
  | 'retour_resolution'
  | 'cloture'

/**
 * Statut interne → étape suivie dont il fait partie.
 *
 * ⚠️ Deux étapes n'y figurent pas, et c'est structurel : `retour_information` n'est rattachée à
 * aucun statut, et `cloture` sert au délai GLOBAL, mesuré depuis la création. Un délai réglé sur
 * ces deux étapes ne produit donc aucune échéance par ce chemin — `etapesSuivies()` l'expose,
 * pour que l'écran d'administration ne laisse pas régler un paramètre sans effet.
 */
const STATUT_VERS_ETAPE: Partial<Record<StatutCode, EtapeDelai>> = {
  affecte: 'analyse_preliminaire',
  en_analyse: 'analyse_preliminaire',
  en_investigation: 'traitement_enquete',
  en_attente_information: 'traitement_enquete',
  action_corrective_en_cours: 'mise_en_oeuvre_mesures',
  resolu: 'retour_resolution',
}

/** Statut dont l'ENTRÉE démarre le chronomètre de chaque étape suivie. */
const ETAPE_VERS_STATUT_DE_DEPART: Partial<Record<EtapeDelai, StatutCode>> = {
  analyse_preliminaire: 'affecte',
  traitement_enquete: 'en_investigation',
  mise_en_oeuvre_mesures: 'action_corrective_en_cours',
  retour_resolution: 'resolu',
}

type SlaDelai = {
  parcours_id: bigint
  etape_code: string
  valeur: number
  unite: string
}

/**
 * Cache mémoire de `sla_delais` (DT-34).
 *
 * Sans ce cache, afficher une liste de 20 dossiers déclencherait 20 requêtes identiques. Le TTL
 * reste court, et `/administration/delais` purge explicitement le cache à l'enregistrement : une
 * valeur corrigée prend effet immédiatement, sans attendre l'expiration ni un redémarrage.
 */
const TTL_CACHE_MS = 5 * 60 * 1000
let cacheDelais: { valeurs: SlaDelai[]; expireA: number } | null = null

async function delaisValides(): Promise<SlaDelai[]> {
  if (cacheDelais && cacheDelais.expireA > Date.now()) {
    return cacheDelais.valeurs
  }

  const valeurs = await prisma.sla_delais.findMany({
    where: { est_valide_metier: true },
    select: { parcours_id: true, etape_code: true, valeur: true, unite: true },
  })

  cacheDelais = { valeurs, expireA: Date.now() + TTL_CACHE_MS }
  return valeurs
}

/** Réservé aux tests : force le rechargement au prochain appel. */
export function viderCacheDelais(): void {
  cacheDelais = null
}

export function etapeActuelle(statut: StatutCode): EtapeDelai | null {
  return STATUT_VERS_ETAPE[statut] ?? null
}

/**
 * Étapes qui produisent réellement une échéance par statut.
 *
 * Une étape absente de cette liste peut porter un délai en base sans qu'aucune relance ni
 * escalade n'en découle : c'est l'information qui manque à qui règle ces valeurs.
 */
export function etapesSuivies(): ReadonlySet<EtapeDelai> {
  return new Set(Object.values(STATUT_VERS_ETAPE))
}

/**
 * DT-04 : un délai non validé par le métier (`est_valide_metier = false`) ne produit AUCUNE
 * échéance — ni affichage, ni alerte. Un délai provisoire ne doit pas déclencher d'escalade.
 */
async function delaiConfigure(parcoursId: bigint, etape: EtapeDelai): Promise<SlaDelai | null> {
  const delais = await delaisValides()

  return (
    delais.find((d) => d.parcours_id === parcoursId && d.etape_code === etape) ?? null
  )
}

/** Ajoute des jours ouvrés (lundi-vendredi). Le CDC ne fournit aucun calendrier de jours fériés
 *  locaux : seuls les week-ends sont exclus. */
function ajouterJoursOuvres(depart: Date, jours: number): Date {
  const date = new Date(depart)
  let restants = jours

  while (restants > 0) {
    date.setDate(date.getDate() + 1)
    const jour = date.getDay()
    if (jour !== 0 && jour !== 6) restants -= 1
  }

  return date
}

function ajouter(depart: Date, valeur: number, unite: string): Date {
  const date = new Date(depart)

  switch (unite) {
    case 'heures':
      date.setHours(date.getHours() + valeur)
      return date
    case 'jours_ouvres':
      return ajouterJoursOuvres(depart, valeur)
    case 'semaines':
      date.setDate(date.getDate() + valeur * 7)
      return date
    case 'mois':
      date.setMonth(date.getMonth() + valeur)
      return date
    default:
      return date
  }
}

/**
 * Début de l'étape courante : dernière ENTRÉE dans le statut qui la déclenche. « Dernière » et
 * non « première » : un dossier réouvert repasse par les mêmes étapes, et c'est le passage le
 * plus récent qui fait foi.
 */
export async function dateDebutEtape(dossier: {
  id: string
  statutCode: StatutCode
}): Promise<Date | null> {
  const etape = etapeActuelle(dossier.statutCode)
  if (!etape) return null

  const statutDepart = ETAPE_VERS_STATUT_DE_DEPART[etape]
  if (!statutDepart) return null

  const entree = await prisma.historique_statuts.findFirst({
    where: {
      dossier_id: dossier.id,
      statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: { code: statutDepart },
    },
    orderBy: { created_at: 'desc' },
    select: { created_at: true },
  })

  return entree?.created_at ?? null
}

export async function dateLimite(dossier: {
  id: string
  statutCode: StatutCode
  parcoursId: bigint
}): Promise<Date | null> {
  const etape = etapeActuelle(dossier.statutCode)
  if (!etape) return null

  const [debut, delai] = await Promise.all([
    dateDebutEtape(dossier),
    delaiConfigure(dossier.parcoursId, etape),
  ])

  if (!debut || !delai) return null

  return ajouter(debut, delai.valeur, delai.unite)
}

/** Jours restants avant l'échéance ; négatif si dépassée. `null` si aucun délai n'est suivi. */
export async function joursRestants(dossier: {
  id: string
  statutCode: StatutCode
  parcoursId: bigint
}): Promise<number | null> {
  const limite = await dateLimite(dossier)
  if (!limite) return null

  const debutJour = (d: Date) => {
    const copie = new Date(d)
    copie.setHours(0, 0, 0, 0)
    return copie.getTime()
  }

  return Math.round((debutJour(limite) - debutJour(new Date())) / 86_400_000)
}

export async function estEnRetard(dossier: {
  id: string
  statutCode: StatutCode
  parcoursId: bigint
}): Promise<boolean> {
  const limite = await dateLimite(dossier)
  return limite !== null && new Date() > limite
}

/**
 * EX-NOT-04 : pourcentage de dépassement du délai alloué à l'étape courante, base du palier
 * d'escalade « +50 % » (alerte Direction). Négatif ou nul tant que l'échéance n'est pas
 * dépassée ; `null` si aucun délai n'est suivi (DT-04).
 */
export async function pourcentageDepassement(dossier: {
  id: string
  statutCode: StatutCode
  parcoursId: bigint
}): Promise<number | null> {
  const [debut, limite] = await Promise.all([dateDebutEtape(dossier), dateLimite(dossier)])
  if (!debut || !limite) return null

  const dureeAllouee = limite.getTime() - debut.getTime()
  if (dureeAllouee <= 0) return null

  const ecoulement = Date.now() - debut.getTime()
  return ((ecoulement - dureeAllouee) / dureeAllouee) * 100
}

/** Délai GLOBAL de traitement (§11.2), mesuré depuis la création, indépendamment du statut. */
export async function estEnRetardGlobalement(dossier: {
  statutCode: StatutCode
  parcoursId: bigint
  creeLe: Date
}): Promise<boolean> {
  // Un dossier clôturé ou rejeté ne peut plus être « en retard » : son traitement est terminé.
  if (dossier.statutCode === 'cloture' || dossier.statutCode === 'rejete') {
    return false
  }

  const delai = await delaiConfigure(dossier.parcoursId, 'cloture')
  if (!delai) return false

  return new Date() > ajouter(dossier.creeLe, delai.valeur, delai.unite)
}
