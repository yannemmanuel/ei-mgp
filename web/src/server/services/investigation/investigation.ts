import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import { dateDebutEtape } from '../dossier/delais'
import { ErreurWorkflow } from '../dossier/workflow'
import type { StatutCode } from '../dossier/statuts'

/**
 * Cycle de vie d'une fiche d'investigation (CDC §9.5, EX-INV-01 à 05) — port de
 * `App\Services\Investigation\InvestigationService`.
 *
 * POINT D'ENTRÉE UNIQUE : ouverture, mise à jour, soumission puis validation hiérarchique.
 * Chaque règle est revérifiée ici, et pas seulement dans le formulaire ou la policy.
 */

export const STATUTS_INVESTIGATION = ['en_cours', 'en_attente_validation', 'validee'] as const
export type StatutInvestigation = (typeof STATUTS_INVESTIGATION)[number]

export type DonneesInvestigation = {
  faitsConstates: string
  personnesRencontrees?: string | null
  causeImmediate?: string | null
  causesRacines?: string | null
  recommandations: string
}

function jourDe(date: Date): number {
  const copie = new Date(date)
  copie.setHours(0, 0, 0, 0)
  return copie.getTime()
}

/**
 * EX-INV-01 : une fiche ne peut être ouverte que sur un dossier « En investigation ».
 *
 * RGI-05 : sa date d'ouverture ne peut être antérieure à la date de recevabilité du dossier —
 * c'est-à-dire son entrée la plus récente dans ce statut. Le calcul est délibérément REPRIS de
 * `dateDebutEtape()` plutôt que réimplémenté : deux définitions de la même date finiraient par
 * diverger.
 */
export async function ouvrirInvestigation(params: {
  dossierId: string
  enqueteurId: bigint
  dateOuverture: Date
  donnees: DonneesInvestigation
}): Promise<string> {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: params.dossierId },
    select: { id: true, statuts_dossier: { select: { code: true } } },
  })

  const statutCode = dossier.statuts_dossier.code as StatutCode

  if (statutCode !== 'en_investigation') {
    throw new ErreurWorkflow(
      'Une fiche d’investigation ne peut être ouverte que sur un dossier « En investigation ».'
    )
  }

  const dateRecevabilite = await dateDebutEtape({ id: dossier.id, statutCode })

  if (!dateRecevabilite) {
    throw new ErreurWorkflow(
      'Impossible de déterminer la date de recevabilité du dossier : historique de statut incomplet.'
    )
  }

  if (jourDe(params.dateOuverture) < jourDe(dateRecevabilite)) {
    throw new ErreurWorkflow(
      'La date d’ouverture ne peut pas précéder la recevabilité du dossier.'
    )
  }

  if (params.donnees.faitsConstates.trim() === '') {
    throw new ErreurWorkflow('Les faits constatés sont obligatoires (EX-INV-02).')
  }

  const maintenant = new Date()

  const investigation = await prisma.investigations.create({
    data: {
      id: ulid().toLowerCase(),
      dossier_id: params.dossierId,
      enqueteur_id: params.enqueteurId,
      date_ouverture: params.dateOuverture,
      faits_constates: params.donnees.faitsConstates,
      personnes_rencontrees: params.donnees.personnesRencontrees || null,
      cause_immediate: params.donnees.causeImmediate || null,
      causes_racines: params.donnees.causesRacines || null,
      recommandations: params.donnees.recommandations,
      statut: 'en_cours',
      created_at: maintenant,
      updated_at: maintenant,
    },
    select: { id: true },
  })

  return investigation.id
}

/** EX-INV-02/03/04 : constats, causes et recommandations, modifiables tant que « en cours ». */
export async function mettreAJourInvestigation(params: {
  investigationId: string
  donnees: DonneesInvestigation
}): Promise<void> {
  const investigation = await prisma.investigations.findUniqueOrThrow({
    where: { id: params.investigationId },
    select: { statut: true },
  })

  if (investigation.statut !== 'en_cours') {
    throw new ErreurWorkflow(
      'Une investigation soumise pour validation ou déjà validée ne peut plus être modifiée.'
    )
  }

  await prisma.investigations.update({
    where: { id: params.investigationId },
    data: {
      faits_constates: params.donnees.faitsConstates,
      personnes_rencontrees: params.donnees.personnesRencontrees || null,
      cause_immediate: params.donnees.causeImmediate || null,
      causes_racines: params.donnees.causesRacines || null,
      recommandations: params.donnees.recommandations,
      updated_at: new Date(),
    },
  })
}

/**
 * EX-INV-04 : les recommandations sont la source des actions correctives (étape 8). Elles sont
 * donc obligatoires avant soumission — une investigation validée sans recommandation ne
 * permettrait de créer aucune action.
 */
export async function soumettrePourValidation(investigationId: string): Promise<void> {
  const investigation = await prisma.investigations.findUniqueOrThrow({
    where: { id: investigationId },
    select: { statut: true, recommandations: true },
  })

  if (investigation.statut !== 'en_cours') {
    throw new ErreurWorkflow('Seule une investigation « en cours » peut être soumise pour validation.')
  }

  if (investigation.recommandations.trim() === '') {
    throw new ErreurWorkflow(
      'Les recommandations sont obligatoires avant soumission pour validation (EX-INV-04).'
    )
  }

  await prisma.investigations.update({
    where: { id: investigationId },
    data: { statut: 'en_attente_validation', updated_at: new Date() },
  })
}

/**
 * RGI-06 / EX-INV-05 : la validation hiérarchique ne peut JAMAIS être effectuée par l'enquêteur
 * lui-même. Revérifié ici en plus de la policy : la policy protège l'accès à la commande, ce
 * contrôle protège la donnée.
 */
export async function validerInvestigation(params: {
  investigationId: string
  validateurId: bigint
}): Promise<void> {
  const investigation = await prisma.investigations.findUniqueOrThrow({
    where: { id: params.investigationId },
    select: { statut: true, enqueteur_id: true },
  })

  if (investigation.statut !== 'en_attente_validation') {
    throw new ErreurWorkflow(
      'Seule une investigation « en attente de validation » peut être validée.'
    )
  }

  if (investigation.enqueteur_id === params.validateurId) {
    throw new ErreurWorkflow(
      'L’enquêteur ne peut pas valider sa propre investigation.'
    )
  }

  await prisma.investigations.update({
    where: { id: params.investigationId },
    data: {
      statut: 'validee',
      valide_par: params.validateurId,
      valide_le: new Date(),
      updated_at: new Date(),
    },
  })
}

/** Investigations d'un dossier, avec leur enquêteur et leur validateur. */
export async function investigationsDuDossier(dossierId: string) {
  return prisma.investigations.findMany({
    where: { dossier_id: dossierId },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      date_ouverture: true,
      statut: true,
      faits_constates: true,
      personnes_rencontrees: true,
      cause_immediate: true,
      causes_racines: true,
      recommandations: true,
      valide_le: true,
      enqueteur_id: true,
      users_investigations_enqueteur_idTousers: { select: { name: true } },
      users_investigations_valide_parTousers: { select: { name: true } },
    },
  })
}
