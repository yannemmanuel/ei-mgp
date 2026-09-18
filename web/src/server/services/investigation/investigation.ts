import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import { dateDebutEtape } from '../dossier/delais'
import { ErreurWorkflow } from '../dossier/workflow'
import type { StatutCode } from '../dossier/statuts'

/**
 * Cycle de vie d'une fiche d'investigation (CDC §9.5, EX-INV-01 à 04) — port de
 * `App\Services\Investigation\InvestigationService`.
 *
 * POINT D'ENTRÉE UNIQUE : ouverture et mise à jour. Chaque règle est revérifiée ici, et pas
 * seulement dans le formulaire ou la policy.
 *
 * ⚠️ UNE INVESTIGATION N'EST SOUMISE À AUCUNE VALIDATION (décision métier du 2026-09-18).
 * La soumission pour validation et la validation hiérarchique (RGI-06, EX-INV-05) ont été
 * retirées : une fiche existe, se modifie, et alimente directement les actions correctives.
 *
 * Ne pas les réintroduire sans décision métier — et surtout pas en passant par `statut` : cette
 * colonne ne porte plus qu'une valeur unique, conservée pour les lignes déjà écrites.
 */

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
 * EX-INV-02 et EX-INV-04, vérifiés à l'ouverture ET à chaque modification.
 *
 * ⚠️ Les recommandations sont la SOURCE des actions correctives (étape 8). Cette exigence ne
 * vivait jusqu'ici que dans `soumettrePourValidation()` — supprimer la validation sans la
 * déplacer ici l'aurait emportée avec elle, et une fiche sans recommandation ne permet de créer
 * aucune action.
 *
 * Elle est donc vérifiée aux deux endroits qui ÉCRIVENT la fiche, et non à une étape ultérieure
 * qui n'existe plus.
 */
function exigerContenu(donnees: DonneesInvestigation): void {
  if (donnees.faitsConstates.trim() === '') {
    throw new ErreurWorkflow('Les faits constatés sont obligatoires (EX-INV-02).')
  }

  if (donnees.recommandations.trim() === '') {
    throw new ErreurWorkflow(
      'Les recommandations sont obligatoires : elles sont la source des actions correctives (EX-INV-04).'
    )
  }
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

  exigerContenu(params.donnees)

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
      // Valeur unique et constante : la colonne survit aux lignes déjà écrites, mais ne porte
      // plus d'étape. Elle n'est ni lue, ni filtrée, ni affichée nulle part.
      statut: 'en_cours',
      created_at: maintenant,
      updated_at: maintenant,
    },
    select: { id: true },
  })

  return investigation.id
}

/**
 * EX-INV-02/03/04 : constats, causes et recommandations.
 *
 * ⚠️ Plus aucun verrou de statut : une fiche reste modifiable. Il n'existe plus d'étape qui la
 * fige, puisqu'il n'existe plus de validation — refuser la modification laisserait des fiches
 * définitivement bloquées sans aucun moyen de les rouvrir.
 */
export async function mettreAJourInvestigation(params: {
  investigationId: string
  donnees: DonneesInvestigation
}): Promise<void> {
  await prisma.investigations.findUniqueOrThrow({
    where: { id: params.investigationId },
    select: { id: true },
  })

  exigerContenu(params.donnees)

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

/** Investigations d'un dossier, avec leur enquêteur. */
export async function investigationsDuDossier(dossierId: string) {
  return prisma.investigations.findMany({
    where: { dossier_id: dossierId },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      date_ouverture: true,
      faits_constates: true,
      personnes_rencontrees: true,
      cause_immediate: true,
      causes_racines: true,
      recommandations: true,
      enqueteur_id: true,
      users_investigations_enqueteur_idTousers: { select: { name: true } },
    },
  })
}
