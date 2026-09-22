import { purgerDebits } from '@/server/auth/throttle'
import { recalculerRetards } from '../action-corrective/action-corrective'
import { detecterRetards, relancerEcheances } from '../notification/taches-planifiees'
import { calculerPour } from '../reporting/statistiques-mensuelles'
import { appliquerPolitiqueConservation } from '../rgpd/conservation'

/**
 * Les 5 tâches planifiées — port de `routes/console.php`.
 *
 * ⚠️ **Next.js n'a pas d'ordonnanceur.** Là où un framework PHP déclare ses tâches et s'appuie
 * sur un ordonnanceur système, il faut ici un
 * déclencheur EXTERNE (cron système, Vercel Cron, ordonnanceur d'entreprise) qui appelle
 * `POST /api/taches/{nom}`.
 *
 * C'est une différence d'exploitation, pas de comportement : sans ce déclencheur, aucune relance
 * ne part, aucun retard n'est détecté, aucune donnée n'est anonymisée. À câbler avant la bascule.
 *
 * RG-08 n'est pas concerné : le circuit critique est synchrone à la soumission, il ne dépend
 * d'aucune de ces tâches.
 */

export type ResultatTache = {
  /** Ce que la tâche a effectivement fait, pour la trace de l'ordonnanceur. */
  readonly resume: string
  readonly details: Record<string, number>
}

export type DefinitionTache = {
  readonly libelle: string
  /** Cadence attendue, reprise de `routes/console.php` — informative, l'ordonnanceur décide. */
  readonly cadence: string
  readonly executer: () => Promise<ResultatTache>
}

/**
 * Le mois précédent, jamais le mois courant : archiver un mois avant son terme figerait des
 * compteurs incomplets, et l'archive n'est jamais réécrite (EX-REP-05).
 */
function moisPrecedent(maintenant: Date = new Date()): Date {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1))
}

export const TACHES = {
  'recalculer-retard-actions': {
    libelle: 'Recalcul du retard des actions correctives (EX-ACT-03)',
    cadence: 'quotidienne',
    executer: async () => {
      const nombre = await recalculerRetards()
      return {
        resume: `${nombre} action(s) corrective(s) marquée(s) en retard.`,
        details: { actions: nombre },
      }
    },
  },
  'relancer-echeances': {
    libelle: 'Relance J-3 des acteurs de traitement (EX-NOT-03)',
    cadence: 'quotidienne',
    executer: async () => {
      const nombre = await relancerEcheances()
      return { resume: `${nombre} dossier(s) relancé(s).`, details: { dossiers: nombre } }
    },
  },
  'detecter-retards': {
    libelle: 'Escalade des dossiers en retard (EX-NOT-04)',
    cadence: 'quotidienne',
    executer: async () => {
      const nombre = await detecterRetards()
      return { resume: `${nombre} dossier(s) en retard escaladé(s).`, details: { dossiers: nombre } }
    },
  },
  'calculer-statistiques-mensuelles': {
    libelle: 'Archivage des statistiques du mois écoulé (EX-REP-05)',
    cadence: 'mensuelle, le 1er à 01h30',
    executer: async () => {
      const resultat = await calculerPour(moisPrecedent())
      return {
        resume: `${resultat.creees} ligne(s) archivée(s), ${resultat.ignorees} déjà présente(s).`,
        details: { creees: resultat.creees, ignorees: resultat.ignorees },
      }
    },
  },
  'purger-compteurs-debit': {
    libelle: 'Purge des compteurs de limitation de débit expirés',
    // Tâche d'entretien propre à ce dispositif : les compteurs de débit vivent dans la table `cache`
    // sous un préfixe propre, que rien d'autre ne nettoie.
    cadence: 'quotidienne',
    executer: async () => {
      const nombre = await purgerDebits()
      return { resume: `${nombre} compteur(s) expiré(s) purgé(s).`, details: { compteurs: nombre } }
    },
  },
  'appliquer-politique-conservation': {
    libelle: 'Archivage et anonymisation des dossiers clôturés',
    cadence: 'mensuelle, le 1er à 02h00',
    executer: async () => {
      const resultat = await appliquerPolitiqueConservation()
      return {
        resume: `${resultat.archives} archivé(s), ${resultat.anonymises} anonymisé(s), ${resultat.exclusPourContentieux} retenu(s) pour contentieux.`,
        details: {
          archives: resultat.archives,
          anonymises: resultat.anonymises,
          exclus_pour_contentieux: resultat.exclusPourContentieux,
        },
      }
    },
  },
} as const satisfies Record<string, DefinitionTache>

export type NomTache = keyof typeof TACHES

export function estTacheConnue(nom: string): nom is NomTache {
  return Object.hasOwn(TACHES, nom)
}
