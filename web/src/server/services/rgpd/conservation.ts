import { prisma } from '@/lib/prisma'
import { MODELES, journaliser } from '../audit/journal'
import { effacerDonneesPersonnelles } from './effacement'

/**
 * RG-11 : politique de conservation des données personnelles.
 *
 * Cycle : 24 mois de consultation active après clôture, puis archivage, puis anonymisation à
 * 10 ans — **sauf contentieux actif**.
 *
 * Trois invariants qui ne se négocient pas :
 *
 * - **La ligne `dossiers` n'est JAMAIS supprimée** (RG-03), et les statistiques agrégées doivent
 *   rester calculables sans limite de durée (RG-12). Ce qui disparaît, c'est la donnée
 *   PERSONNELLE — la liste vit dans `effacement.ts`, avec la raison de chaque inclusion et de
 *   chaque exclusion.
 * - **Périmètre limité à `date_cloture IS NOT NULL`.** Un dossier rejeté n'a pas de date de
 *   clôture et n'entre donc jamais dans ce cycle (DT-32) : lui en donner une serait une
 *   extension non demandée.
 * - **Un dossier n'est marqué anonymisé que si son effacement a ABOUTI.** Marquer malgré un
 *   échec produirait un dossier ré-identifiable portant une trace qui affirme le contraire, et
 *   qu'aucun passage ultérieur ne reprendrait.
 */

const MOIS_ARCHIVAGE = 24
const ANNEES_ANONYMISATION = 10

function ilYaMois(nombre: number, maintenant: Date): Date {
  const date = new Date(maintenant)
  date.setMonth(date.getMonth() - nombre)
  return date
}

function ilYaAnnees(nombre: number, maintenant: Date): Date {
  const date = new Date(maintenant)
  date.setFullYear(date.getFullYear() - nombre)
  return date
}

/** Marque « archivé » tout dossier clôturé depuis plus de 24 mois et pas encore marqué. */
export async function archiver(maintenant: Date = new Date()): Promise<number> {
  const seuil = ilYaMois(MOIS_ARCHIVAGE, maintenant)

  const eligibles = await prisma.dossiers.findMany({
    where: {
      date_cloture: { not: null, lte: seuil },
      archive_le: null,
    },
    select: { id: true },
  })

  if (eligibles.length === 0) return 0

  await prisma.dossiers.updateMany({
    where: { id: { in: eligibles.map((d) => d.id) } },
    data: { archive_le: maintenant, updated_at: maintenant },
  })

  // L'archivage est une décision de conservation : elle doit être explicable à un auditeur, et
  // ce n'est pas une action d'utilisateur — `user_id` reste nul, comme pour toute écriture hors
  // requête HTTP.
  for (const dossier of eligibles) {
    await journaliser({
      action: 'dossier.archive',
      auditableType: MODELES.dossier,
      auditableId: dossier.id,
      nouvelles: { archive_le: maintenant },
    })
  }

  return eligibles.length
}

/**
 * Nombre maximal de dossiers anonymisés par exécution.
 *
 * ⚠️ SANS CETTE BORNE, LE PREMIER PASSAGE TRAITAIT TOUT L'ARRIÉRÉ EN UNE FOIS. L'ensemble éligible
 * est « tous les dossiers clôturés depuis plus de dix ans » : après dix ans d'exploitation, c'est
 * un volume d'un coup, dans une fonction serverless dont le temps d'exécution est plafonné. Une
 * interruption à mi-course laissait des dossiers à demi anonymisés.
 *
 * La tâche est MENSUELLE : 500 par passage absorbe très largement le flux normal, et l'arriéré
 * initial se résorbe en quelques mois — pendant lesquels rien n'est jamais laissé à moitié fait.
 */
const LOT_ANONYMISATION = 500

export type BilanAnonymisation = {
  /** Dossiers entièrement traités et marqués. */
  readonly anonymises: number
  /**
   * Dossiers dont l'effacement a ÉCHOUÉ — non marqués, donc repris au passage suivant.
   *
   * ⚠️ Ce chiffre doit rester à zéro. Durablement non nul, il signale des dossiers qui ne
   * s'anonymiseront jamais : un magasin de fichiers injoignable, un chemin corrompu.
   */
  readonly echecs: number
  /**
   * Dossiers encore éligibles après ce passage.
   *
   * ⚠️ UN NOMBRE, PAS UN BOOLÉEN : « il en reste » n'apprend rien à qui lit le résumé de la
   * tâche, alors que « il en reste 12 400 » dit combien de mois l'arriéré mettra à se résorber,
   * et s'il progresse d'un passage à l'autre.
   */
  readonly restants: number
}

/**
 * Efface les données personnelles des dossiers clôturés depuis plus de 10 ans, hors contentieux,
 * et marque `anonymise_le`.
 *
 * La borne haute de la fourchette du CDC (« 5 à 10 ans ») est retenue : en cas d'ambiguïté, la
 * lecture la plus protectrice pour le déclarant l'emporte — ici, conserver plus longtemps avant
 * d'effacer (DT-32).
 *
 * ⚠️ CE QUI EST EFFACÉ A CHANGÉ le 2026-09-22, et le périmètre d'origine était trop étroit :
 * seule la ligne `declaration_identites` partait. Pièces jointes, messages, personnes rencontrées
 * en investigation, nom du responsable d'action corrective et tous les champs libres survivaient.
 * Le dossier était marqué anonymisé sans l'être. Voir `effacement.ts`, qui porte la liste.
 *
 * ⚠️ UN DOSSIER N'EST MARQUÉ QUE SI SON EFFACEMENT A ABOUTI. C'est l'invariant de cette fonction :
 * marquer d'abord, ou marquer malgré une erreur, produirait un dossier à demi effacé que plus
 * aucun passage ne reprendrait — et dont la trace juridique affirmerait qu'il est en règle. Un
 * échec est donc compté, journalisé, et le dossier reste éligible.
 */
export async function anonymiser(maintenant: Date = new Date()): Promise<BilanAnonymisation> {
  const seuil = ilYaAnnees(ANNEES_ANONYMISATION, maintenant)

  const critere = {
    date_cloture: { not: null, lte: seuil },
    anonymise_le: null,
    // Seul mécanisme d'exception « sauf contentieux » du CDC ; seul le DPO peut poser ce bit.
    contentieux: false,
  } as const

  const eligibles = await prisma.dossiers.findMany({
    where: critere,
    select: { id: true },
    // Les plus anciens d'abord : ce sont ceux dont l'obligation d'effacement court depuis le plus
    // longtemps. Sans ordre, un arriéré traité par lots pourrait en laisser indéfiniment de côté.
    orderBy: { date_cloture: 'asc' },
    take: LOT_ANONYMISATION,
  })

  let anonymises = 0
  let echecs = 0

  for (const dossier of eligibles) {
    try {
      const efface = await effacerDonneesPersonnelles(dossier.id)

      await prisma.dossiers.update({
        where: { id: dossier.id },
        data: { anonymise_le: maintenant, updated_at: maintenant },
      })

      await journaliser({
        action: 'dossier.anonymise',
        auditableType: MODELES.dossier,
        auditableId: dossier.id,
        /*
          Des DÉCOMPTES, jamais le contenu : consigner l'identité au moment de l'effacer
          reviendrait à la déplacer dans le journal plutôt qu'à la supprimer.

          ⚠️ RECOPIÉS EN SERPENT, un par un, plutôt qu'étalés depuis le résultat. Le journal
          écrit des noms de colonne (`anonymise_le`) ; y déverser des clés camelCase aurait
          produit deux conventions dans la même ligne, et cassé la lecture des traces déjà
          écrites sous `identites_supprimees`.
        */
        nouvelles: {
          anonymise_le: maintenant,
          identites_supprimees: efface.identitesSupprimees,
          pieces_supprimees: efface.piecesSupprimees,
          messages_vides: efface.messagesVides,
          commentaires_vides: efface.commentairesVides,
          investigations_nettoyees: efface.investigationsNettoyees,
          actions_nettoyees: efface.actionsNettoyees,
        },
      })

      anonymises += 1
    } catch (erreur) {
      /*
        ⚠️ L'ÉCHEC EST ISOLÉ, PAS AVALÉ. Un magasin de fichiers injoignable ne doit pas priver de
        leur effacement tous les dossiers suivants du lot — mais il ne doit pas non plus passer
        inaperçu : le dossier N'EST PAS marqué, il revient au passage suivant, et le bilan le
        compte pour que la tâche planifiée le remonte.
      */
      echecs += 1
      console.error(`Anonymisation en échec pour le dossier ${dossier.id}`, erreur)
    }
  }

  // Recompté APRÈS le traitement : les dossiers marqués dans ce passage sortent du critère, et
  // ceux dont l'effacement a échoué y restent — c'est bien ce qu'on veut annoncer.
  const restants = await prisma.dossiers.count({ where: critere })

  return { anonymises, echecs, restants }
}

/**
 * Dossiers éligibles à l'anonymisation mais retenus pour contentieux actif.
 *
 * Compté, jamais traité automatiquement : lever un blocage de contentieux est une décision du
 * DPO, pas un effet de bord d'une tâche planifiée.
 */
export async function compterExclusPourContentieux(maintenant: Date = new Date()): Promise<number> {
  return prisma.dossiers.count({
    where: {
      date_cloture: { not: null, lte: ilYaAnnees(ANNEES_ANONYMISATION, maintenant) },
      anonymise_le: null,
      contentieux: true,
    },
  })
}

export type ResultatConservation = {
  archives: number
  anonymises: number
  /** Dossiers dont l'effacement a échoué : non marqués, repris au passage suivant. */
  echecsAnonymisation: number
  /** Dossiers encore éligibles après ce passage — la prochaine exécution les prendra. */
  restantsAAnonymiser: number
  exclusPourContentieux: number
}

export async function appliquerPolitiqueConservation(
  maintenant: Date = new Date()
): Promise<ResultatConservation> {
  const archives = await archiver(maintenant)
  const bilan = await anonymiser(maintenant)
  const exclusPourContentieux = await compterExclusPourContentieux(maintenant)

  return {
    archives,
    anonymises: bilan.anonymises,
    echecsAnonymisation: bilan.echecs,
    restantsAAnonymiser: bilan.restants,
    exclusPourContentieux,
  }
}

/**
 * Pose ou lève le blocage « contentieux » (RG-11).
 *
 * Seul mécanisme d'exception à l'anonymisation automatique. Réservé au DPO
 * (`rgpd.conservation.manage`) : l'autorisation est vérifiée par l'appelant, ce module ne fait
 * que l'appliquer.
 *
 * Journalisé sous `dossier.modifie`, au même titre que toute autre modification de
 * n'importe quelle colonne de `dossiers` : ce blocage suspend une obligation d'effacement, il
 * doit rester explicable à un auditeur.
 */
export async function basculerContentieux(dossierId: string): Promise<boolean> {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { contentieux: true },
  })

  const contentieux = !dossier.contentieux

  await prisma.dossiers.update({
    where: { id: dossierId },
    data: { contentieux, updated_at: new Date() },
  })

  await journaliser({
    action: 'dossier.modifie',
    auditableType: MODELES.dossier,
    auditableId: dossierId,
    anciennes: { contentieux: dossier.contentieux },
    nouvelles: { contentieux },
  })

  return contentieux
}
