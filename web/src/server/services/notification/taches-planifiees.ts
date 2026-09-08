import { prisma } from '@/lib/prisma'
import type { StatutCode } from '../dossier/statuts'
import {
  estEnRetard,
  estEnRetardGlobalement,
  joursRestants,
  pourcentageDepassement,
} from '../dossier/delais'
import { responsablesHierarchiques, titulairesDuDossier, utilisateursAvecRoles } from './destinataires'
import { envoyerNotification } from './notification'

/**
 * Tâches planifiées du module Notifications — port de `RelancerEcheances` et `DetecterRetards`.
 *
 * Exécutées par un ordonnanceur EXTERNE (cron système, Vercel Cron) : Next.js n'en fournit
 * aucun. Ces fonctions sont volontairement autonomes et idempotentes à l'échelle d'une journée,
 * pour pouvoir être appelées depuis une route d'API protégée ou un script (étape 12).
 */

/** Dossiers encore actifs : un dossier terminal n'a plus d'échéance à tenir. */
async function dossiersActifs() {
  return prisma.dossiers.findMany({
    where: { statuts_dossier: { is_terminal: false } },
    select: {
      id: true,
      parcours_id: true,
      created_at: true,
      statuts_dossier: { select: { code: true } },
    },
  })
}

/**
 * EX-NOT-03 : relance des acteurs de traitement 3 jours avant l'échéance de l'étape courante.
 *
 * Déclenchée le jour EXACT où il reste 3 jours, et non chaque jour de J-3 à J-0 : sinon un même
 * dossier générerait quatre relances pour une seule étape, et le signal se banaliserait.
 */
const SEUIL_JOURS_RELANCE = 3

export async function relancerEcheances(): Promise<number> {
  const dossiers = await dossiersActifs()
  let compteur = 0

  for (const dossier of dossiers) {
    const restants = await joursRestants({
      id: dossier.id,
      statutCode: dossier.statuts_dossier.code as StatutCode,
      parcoursId: dossier.parcours_id,
    })

    if (restants !== SEUIL_JOURS_RELANCE) continue

    const destinataires = await titulairesDuDossier(dossier.id)
    if (destinataires.length === 0) continue

    await envoyerNotification({
      evenementCode: 'relance_echeance',
      dossierId: dossier.id,
      destinataires,
      contexte: { jours_restants: String(SEUIL_JOURS_RELANCE) },
    })

    compteur += 1
  }

  return compteur
}

/**
 * EX-NOT-04 : escalade en cas de dépassement d'échéance.
 *
 * Dès le dépassement : N+1 des titulaires **et** Service MGP.
 * Au-delà de +50 % du délai alloué : la Direction Générale est alertée en plus.
 *
 * **Deux dépassements distincts déclenchent l'escalade** (RG-05, CDC §11.2) : celui de l'étape
 * courante, et celui du délai GLOBAL mesuré depuis la création (DT-23). Un dossier peut respecter
 * chacune de ses étapes et dépasser malgré tout l'enveloppe totale — en ne surveillant que les
 * étapes, ce cas passait inaperçu. L'escalade reste unique par dossier, quel que soit le nombre
 * de dépassements constatés : deux alertes pour un même retard se banaliseraient.
 */
const SEUIL_DIRECTION_POURCENT = 50

export async function detecterRetards(): Promise<number> {
  const dossiers = await dossiersActifs()
  let compteur = 0

  for (const dossier of dossiers) {
    const contexteDelai = {
      id: dossier.id,
      statutCode: dossier.statuts_dossier.code as StatutCode,
      parcoursId: dossier.parcours_id,
    }

    const enRetardEtape = await estEnRetard(contexteDelai)

    const enRetardGlobal = await estEnRetardGlobalement({
      statutCode: dossier.statuts_dossier.code as StatutCode,
      parcoursId: dossier.parcours_id,
      creeLe: dossier.created_at ?? new Date(),
    })

    if (!enRetardEtape && !enRetardGlobal) continue

    const n1 = await responsablesHierarchiques(dossier.id)
    if (n1.length > 0) {
      await envoyerNotification({
        evenementCode: 'alerte_retard_n1',
        dossierId: dossier.id,
        destinataires: n1,
      })
    }

    const serviceMgp = await utilisateursAvecRoles(['service_mgp'])
    if (serviceMgp.length > 0) {
      await envoyerNotification({
        evenementCode: 'alerte_retard_service_mgp',
        dossierId: dossier.id,
        destinataires: serviceMgp,
      })
    }

    // Le palier « Direction » se mesure sur l'étape courante : un dépassement global sans
    // dépassement d'étape n'a pas de pourcentage propre à comparer.
    const depassement = await pourcentageDepassement(contexteDelai)

    if (depassement !== null && depassement >= SEUIL_DIRECTION_POURCENT) {
      const direction = await utilisateursAvecRoles(['dg'])
      if (direction.length > 0) {
        await envoyerNotification({
          evenementCode: 'alerte_retard_direction',
          dossierId: dossier.id,
          destinataires: direction,
        })
      }
    }

    compteur += 1
  }

  return compteur
}
