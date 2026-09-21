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
  /*
    « Reçu » compte désormais pour l'analyse préliminaire.

    L'évènement indésirable n'est plus affecté à personne : il reste à « reçu » jusqu'à ce que le
    chargé de sécurité le traite. Sans cette ligne, il n'entrait dans AUCUNE étape suivie — donc
    aucune échéance, aucune relance, aucune escalade, et rien à afficher là où le métier demande
    précisément de voir le délai. Le dossier serait resté indéfiniment à l'heure.

    C'est aussi la lecture la plus juste du délai : il court depuis le dépôt, qui est le moment
    que le déclarant connaît, et non depuis une affectation interne dont il n'a jamais rien su.
  */
  recu: 'analyse_preliminaire',
  en_analyse: 'analyse_preliminaire',
  en_investigation: 'traitement_enquete',
  en_attente_information: 'traitement_enquete',
  action_corrective_en_cours: 'mise_en_oeuvre_mesures',
  resolu: 'retour_resolution',
}

/**
 * Statuts dont l'ENTRÉE démarre le chronomètre de chaque étape suivie, par ordre de préférence.
 *
 * ⚠️ Une LISTE, et l'ordre y est la règle : on retient le premier statut dont l'historique porte
 * une entrée.
 *
 * ⚠️ « AFFECTÉ » EN EST SORTI avec le reste du circuit, le 2026-09-21. L'analyse préliminaire
 * démarrait à l'affectation quand il y en avait une ; plus aucune n'est faite, et l'étape part
 * donc de la RÉCEPTION — ce qui est aussi la lecture la plus juste du délai : il court depuis le
 * dépôt, le seul moment que le déclarant connaisse.
 *
 * Effet sur les quatre dossiers déjà passés par « Affecté » : leur chronomètre repart de « Reçu »
 * au lieu de « Affecté ». Les deux entrées d'historique ayant été écrites dans la MÊME
 * transaction — l'affectation était automatique et immédiate —, l'échéance calculée ne bouge que
 * de quelques millisecondes.
 */
const ETAPE_VERS_STATUTS_DE_DEPART: Partial<Record<EtapeDelai, readonly StatutCode[]>> = {
  analyse_preliminaire: ['recu'],
  traitement_enquete: ['en_investigation'],
  mise_en_oeuvre_mesures: ['action_corrective_en_cours'],
  retour_resolution: ['resolu'],
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
 * Statuts dont un dossier peut porter une échéance courante.
 *
 * ⚠️ DÉRIVÉ de `STATUT_VERS_ETAPE`, jamais écrit à la main. La liste l'était, dans `aTraiter()`,
 * et elle a cessé d'être vraie à la première étape ajoutée : « reçu » est entré dans l'analyse
 * préliminaire sans y entrer, si bien que le calcul unitaire trouvait des dossiers en retard que
 * le décompte du tableau de bord ne voyait pas. Un écart de ce genre ne se lit jamais comme une
 * erreur : il se lit comme un dossier à l'heure.
 */
export function statutsAvecEcheance(): StatutCode[] {
  return Object.keys(STATUT_VERS_ETAPE) as StatutCode[]
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

  const candidats = ETAPE_VERS_STATUTS_DE_DEPART[etape]
  if (!candidats || candidats.length === 0) return null

  // L'ORDRE fait la règle : on s'arrête au premier statut dont l'historique porte une entrée.
  // Une seule requête pour tous les candidats, puis le choix se fait en mémoire — les interroger
  // l'un après l'autre multiplierait les allers-retours sur le chemin le plus emprunté.
  const entrees = await prisma.historique_statuts.findMany({
    where: {
      dossier_id: dossier.id,
      statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: {
        code: { in: [...candidats] },
      },
    },
    orderBy: { created_at: 'desc' },
    select: {
      created_at: true,
      statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: {
        select: { code: true },
      },
    },
  })

  for (const candidat of candidats) {
    // Décroissant : la première trouvée est la plus récente. Un dossier rouvert repasse par les
    // mêmes étapes, et c'est le dernier passage qui fait foi.
    const entree = entrees.find(
      (e) => e.statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier.code === candidat
    )

    if (entree?.created_at) return entree.created_at
  }

  return null
}

/**
 * Échéances d'un LOT de dossiers, en deux requêtes au lieu d'une par dossier.
 *
 * Le tableau de bord avait renoncé à compter les dossiers en retard pour cette raison exacte :
 * `dateDebutEtape()` interroge `historique_statuts` dossier par dossier, et l'appeler sur tout un
 * périmètre à chaque affichage de la page la plus visitée aurait créé un vrai N+1. Le nombre de
 * dossiers en retard est pourtant l'information la plus utile de cet écran — celle qui dit quoi
 * faire, quand les taux ne disent que ce qui s'est passé.
 *
 * La règle n'est pas réécrite : ce lot passe par les MÊMES `etapeActuelle`, `ETAPE_VERS_STATUT_DE_DEPART`,
 * `delaisValides` et `ajouter` que le calcul unitaire. Deux définitions de la même échéance
 * finiraient par diverger, et l'écart se verrait d'abord sur une alerte qui ne part pas.
 *
 * Renvoie `null` pour un dossier dont l'étape n'est pas suivie, dont le délai n'est pas validé
 * (DT-04), ou dont l'historique ne porte pas l'entrée attendue.
 */
export async function datesLimites(
  dossiers: readonly { id: string; statutCode: StatutCode; parcoursId: bigint }[]
): Promise<Map<string, Date | null>> {
  const resultat = new Map<string, Date | null>(dossiers.map((d) => [d.id, null]))
  if (dossiers.length === 0) return resultat

  // Quels statuts de départ sont à chercher, et pour quels dossiers.
  const aChercher = dossiers
    .map((d) => {
      const etape = etapeActuelle(d.statutCode)
      const candidats = etape ? ETAPE_VERS_STATUTS_DE_DEPART[etape] : undefined
      return candidats && candidats.length > 0 ? { ...d, etape: etape!, candidats } : null
    })
    .filter((d) => d !== null)

  if (aChercher.length === 0) return resultat

  const [entrees, delais] = await Promise.all([
    prisma.historique_statuts.findMany({
      where: {
        dossier_id: { in: aChercher.map((d) => d.id) },
        statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: {
          code: { in: [...new Set(aChercher.flatMap((d) => [...d.candidats]))] },
        },
      },
      // Décroissant : la PREMIÈRE ligne vue pour un couple (dossier, statut) est donc la plus
      // récente — un dossier réouvert repasse par les mêmes étapes, et c'est le dernier passage
      // qui fait foi.
      orderBy: { created_at: 'desc' },
      select: {
        dossier_id: true,
        created_at: true,
        statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: {
          select: { code: true },
        },
      },
    }),
    delaisValides(),
  ])

  const derniereEntree = new Map<string, Date>()
  for (const entree of entrees) {
    const cle = `${entree.dossier_id}|${entree.statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier.code}`
    if (!derniereEntree.has(cle) && entree.created_at) {
      derniereEntree.set(cle, entree.created_at)
    }
  }

  for (const dossier of aChercher) {
    // Même ordre de préférence que `dateDebutEtape` : l'affectation d'abord, la réception à
    // défaut. La règle est lue au même endroit, `ETAPE_VERS_STATUTS_DE_DEPART`, et appliquée
    // pareillement — deux définitions de la même échéance finiraient par diverger, et l'écart se
    // verrait d'abord sur une alerte qui ne part pas.
    let debut: Date | undefined
    for (const candidat of dossier.candidats) {
      debut = derniereEntree.get(`${dossier.id}|${candidat}`)
      if (debut) break
    }

    if (!debut) continue

    const delai = delais.find(
      (d) => d.parcours_id === dossier.parcoursId && d.etape_code === dossier.etape
    )
    if (!delai) continue

    resultat.set(dossier.id, ajouter(debut, delai.valeur, delai.unite))
  }

  return resultat
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

/**
 * Échéance GLOBALE de traitement (CDC §11.2), mesurée depuis la CRÉATION du dossier.
 *
 * DT-23 : « Clôture, suivi et évaluation » n'est pas une sous-étape déclenchée par un statut,
 * mais l'enveloppe totale dans laquelle le dossier doit être traité. Un dossier peut donc
 * respecter chacune de ses étapes et dépasser malgré tout ce délai d'ensemble — c'est
 * précisément ce que cette mesure attrape.
 *
 * `null` si le parcours n'a pas de délai de clôture validé.
 */
export async function dateLimiteGlobale(dossier: {
  parcoursId: bigint
  creeLe: Date
}): Promise<Date | null> {
  const delai = await delaiConfigure(dossier.parcoursId, 'cloture')

  return delai ? ajouter(dossier.creeLe, delai.valeur, delai.unite) : null
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

  const limite = await dateLimiteGlobale(dossier)

  return limite !== null && new Date() > limite
}
