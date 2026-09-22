import { prisma } from '@/lib/prisma'
import { MODELES, journaliser } from '../audit/journal'

/**
 * RG-11 : politique de conservation des données personnelles — port de
 * `App\Services\Rgpd\PolitiqueConservationService`.
 *
 * Cycle : 24 mois de consultation active après clôture, puis archivage, puis anonymisation à
 * 10 ans — **sauf contentieux actif**.
 *
 * Deux invariants qui ne se négocient pas :
 *
 * - **La ligne `dossiers` n'est JAMAIS supprimée** (RG-03), et les statistiques agrégées doivent
 *   rester calculables sans limite de durée (RG-12). Seule la ligne `declaration_identites`
 *   disparaît à l'anonymisation.
 * - **Périmètre limité à `date_cloture IS NOT NULL`.** Un dossier rejeté n'a pas de date de
 *   clôture et n'entre donc jamais dans ce cycle (DT-32) : lui en donner une serait une
 *   extension non demandée.
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
 * Supprime la donnée d'identité des dossiers clôturés depuis plus de 10 ans, hors contentieux,
 * et marque `anonymise_le`.
 *
 * La borne haute de la fourchette du CDC (« 5 à 10 ans ») est retenue : en cas d'ambiguïté, la
 * lecture la plus protectrice pour le déclarant l'emporte — ici, conserver plus longtemps avant
 * d'effacer (DT-32).
 */
export async function anonymiser(maintenant: Date = new Date()): Promise<number> {
  const seuil = ilYaAnnees(ANNEES_ANONYMISATION, maintenant)

  const eligibles = await prisma.dossiers.findMany({
    where: {
      date_cloture: { not: null, lte: seuil },
      anonymise_le: null,
      // Seul mécanisme d'exception « sauf contentieux » du CDC ; seul le DPO peut poser ce bit.
      contentieux: false,
    },
    select: { id: true, is_anonymous: true },
  })

  for (const dossier of eligibles) {
    // Un dossier déjà anonyme n'a pas de ligne d'identité : `deleteMany` ne fait alors rien,
    // là où `delete` lèverait.
    const supprimees = await prisma.declaration_identites.deleteMany({
      where: { dossier_id: dossier.id },
    })

    await prisma.dossiers.update({
      where: { id: dossier.id },
      data: { anonymise_le: maintenant, updated_at: maintenant },
    })

    await journaliser({
      action: 'dossier.anonymise',
      auditableType: MODELES.dossier,
      auditableId: dossier.id,
      // Le nombre de lignes, jamais leur contenu : consigner l'identité au moment de l'effacer
      // reviendrait à la déplacer dans le journal plutôt qu'à la supprimer.
      nouvelles: { anonymise_le: maintenant, identites_supprimees: supprimees.count },
    })
  }

  return eligibles.length
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
  exclusPourContentieux: number
}

export async function appliquerPolitiqueConservation(
  maintenant: Date = new Date()
): Promise<ResultatConservation> {
  const archives = await archiver(maintenant)
  const anonymises = await anonymiser(maintenant)
  const exclusPourContentieux = await compterExclusPourContentieux(maintenant)

  return { archives, anonymises, exclusPourContentieux }
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
