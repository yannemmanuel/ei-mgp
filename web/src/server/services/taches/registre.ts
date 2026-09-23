import { purgerDebits } from '@/server/auth/throttle'
import { recalculerRetards } from '../action-corrective/action-corrective'
import { detecterRetards, relancerEcheances } from '../notification/taches-planifiees'
import { calculerPour } from '../reporting/statistiques-mensuelles'
import { appliquerPolitiqueConservation } from '../rgpd/conservation'
import { ramasserFichiersOrphelins } from '../stockage/ramasse-miettes'

/**
 * Les 6 tâches planifiées.
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
  /** Cadence attendue — informative : c'est l'ordonnanceur externe qui décide réellement. */
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
  'ramasser-fichiers-orphelins': {
    libelle: 'Effacement des fichiers que plus aucune pièce jointe ne désigne',
    /*
      Hebdomadaire, pas quotidienne : ces fichiers ne gênent personne, ils occupent de la place.
      Le traitement parcourt TOUT le magasin, ce qui n'a pas à se répéter chaque nuit.
    */
    cadence: 'hebdomadaire, le dimanche à 03h00',
    executer: async () => {
      const resultat = await ramasserFichiersOrphelins()

      const mo = (resultat.octetsLiberes / 1_048_576).toFixed(1)

      // ⚠️ L'âge inconnu est dit : ces fichiers ne partiront JAMAIS d'eux-mêmes, et ce résumé est
      // le seul endroit où quelqu'un l'apprendra.
      const alerte =
        resultat.ageInconnu > 0
          ? ` ⚠️ ${resultat.ageInconnu} orphelin(s) d'âge inconnu, laissés en place — décision à prendre à la main.`
          : ''

      return {
        resume:
          `${resultat.effaces} fichier(s) orphelin(s) effacé(s), ${mo} Mo libérés ` +
          `(${resultat.tropRecents} encore dans le délai de grâce).${alerte}`,
        details: {
          effaces: resultat.effaces,
          octets_liberes: resultat.octetsLiberes,
          age_inconnu: resultat.ageInconnu,
          trop_recents: resultat.tropRecents,
        },
      }
    },
  },
  'appliquer-politique-conservation': {
    libelle: 'Archivage et anonymisation des dossiers clôturés',
    cadence: 'mensuelle, le 1er à 02h00',
    executer: async () => {
      const resultat = await appliquerPolitiqueConservation()

      /*
        ⚠️ LES ÉCHECS ET LE RESTE À FAIRE SONT DITS DANS LE RÉSUMÉ, pas seulement dans le détail.

        Un effacement en échec laisse un dossier NON marqué, donc ré-identifiable, et le seul
        endroit où quelqu'un le verra est ce résumé. Le taire reproduirait exactement le défaut
        que cette reprise corrige : un dispositif qui a l'air en règle et ne l'est pas.
      */
      const alertes = [
        resultat.echecsAnonymisation > 0
          ? `⚠️ ${resultat.echecsAnonymisation} effacement(s) en ÉCHEC — dossiers non marqués, repris au prochain passage`
          : null,
        resultat.restantsAAnonymiser > 0
          ? `${resultat.restantsAAnonymiser} encore éligible(s) au prochain passage`
          : null,
      ].filter(Boolean)

      return {
        resume:
          `${resultat.archives} archivé(s), ${resultat.anonymises} anonymisé(s), ` +
          `${resultat.exclusPourContentieux} retenu(s) pour contentieux.` +
          (alertes.length > 0 ? ` ${alertes.join(' · ')}` : ''),
        details: {
          archives: resultat.archives,
          anonymises: resultat.anonymises,
          echecs_anonymisation: resultat.echecsAnonymisation,
          restants_a_anonymiser: resultat.restantsAAnonymiser,
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
