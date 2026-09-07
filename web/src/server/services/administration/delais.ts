import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { etapesSuivies, viderCacheDelais, type EtapeDelai } from '../dossier/delais'
import { MODELES, difference, journaliser, sansChangement, type ValeursAudit } from '../audit/journal'

/**
 * Délais SLA administrables (CDC §11.2) — sans équivalent dans la baseline, où les valeurs ne
 * pouvaient changer que par un déploiement du seeder.
 *
 * Rendus paramétrables sur décision du métier : les cellules « à valider » du CDC (§1.8 point 4)
 * se règlent désormais depuis l'application.
 *
 * `est_valide_metier` reste le commutateur décisif (DT-04) : tant qu'il est faux, **aucune
 * échéance n'est calculée** pour cette étape — donc ni relance J-3, ni escalade. Une valeur
 * provisoire ne doit pas déclencher d'alerte.
 */

type Acteur = { id: bigint }

/** Unités reconnues par le calcul d'échéance (`services/dossier/delais.ts::ajouter`). */
export const UNITES_DELAI = ['heures', 'jours_ouvres', 'semaines', 'mois'] as const
export type UniteDelai = (typeof UNITES_DELAI)[number]

export const LIBELLES_UNITE: Record<UniteDelai, string> = {
  heures: 'Heures',
  jours_ouvres: 'Jours ouvrés',
  semaines: 'Semaines',
  mois: 'Mois',
}

export const LIBELLES_ETAPE: Record<EtapeDelai, string> = {
  analyse_preliminaire: 'Analyse préliminaire',
  traitement_enquete: 'Traitement et enquête',
  retour_information: 'Retour d’information',
  mise_en_oeuvre_mesures: 'Mise en œuvre des mesures',
  retour_resolution: 'Retour après résolution',
  cloture: 'Clôture, suivi et évaluation',
}

/** Toutes les étapes réglables, y compris celles sans effet — l'écran signale lesquelles. */
export const ETAPES_DELAI = [
  'analyse_preliminaire',
  'traitement_enquete',
  'retour_information',
  'mise_en_oeuvre_mesures',
  'retour_resolution',
  'cloture',
] as const satisfies readonly EtapeDelai[]

/**
 * `true` si un délai réglé sur cette étape produit réellement une échéance.
 *
 * `retour_information` n'est rattachée à aucun statut, et `cloture` porte le délai global, que
 * rien n'évalue aujourd'hui. Régler ces valeurs sans le savoir donnerait l'illusion d'un suivi.
 */
export function etapeProduitUneEcheance(etape: string): boolean {
  return etapesSuivies().has(etape as EtapeDelai)
}

export type DonneesDelai = {
  valeur: number
  unite: UniteDelai
  estValideMetier: boolean
  notes: string | null
}

export async function listerDelais() {
  return prisma.sla_delais.findMany({
    orderBy: [{ parcours_id: 'asc' }, { etape_code: 'asc' }],
    select: {
      id: true,
      etape_code: true,
      valeur: true,
      unite: true,
      est_valide_metier: true,
      notes: true,
      parcours: { select: { libelle: true } },
    },
  })
}

/**
 * Crée le délai d'un couple (parcours, étape) qui n'en a pas encore.
 *
 * Toutes les combinaisons ne sont pas semées : EI Employé n'a par exemple aucune ligne pour
 * « Retour après résolution », si bien qu'un dossier EI passé à « Résolu » n'a aucune échéance.
 * Cette création comble ces trous sans qu'il faille toucher à la base.
 */
export async function creerDelai(
  acteur: Acteur,
  parcoursId: bigint,
  etape: EtapeDelai,
  donnees: DonneesDelai
): Promise<bigint> {
  if (!ETAPES_DELAI.includes(etape)) {
    throw new ErreurWorkflow('Étape inconnue.')
  }

  const existant = await prisma.sla_delais.findFirst({
    where: { parcours_id: parcoursId, etape_code: etape },
    select: { id: true },
  })

  if (existant) {
    throw new ErreurWorkflow('Ce parcours a déjà un délai pour cette étape ; modifiez-le.')
  }

  valider(donnees)

  const cree = await prisma.sla_delais.create({
    data: {
      parcours_id: parcoursId,
      etape_code: etape,
      valeur: donnees.valeur,
      unite: donnees.unite,
      est_valide_metier: donnees.estValideMetier,
      notes: donnees.notes,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })

  viderCacheDelais()

  await journaliser({
    action: 'sla_delai.cree',
    acteurId: acteur.id,
    auditableType: MODELES.slaDelai,
    auditableId: String(cree.id),
    nouvelles: {
      parcours_id: String(parcoursId),
      etape_code: etape,
      valeur: donnees.valeur,
      unite: donnees.unite,
      est_valide_metier: donnees.estValideMetier,
    },
  })

  return cree.id
}

function valider(donnees: DonneesDelai): void {
  if (!Number.isInteger(donnees.valeur) || donnees.valeur < 1) {
    throw new ErreurWorkflow('Le délai doit être un nombre entier d’au moins 1.')
  }

  if (!UNITES_DELAI.includes(donnees.unite)) {
    throw new ErreurWorkflow('Unité de délai inconnue.')
  }
}

export async function modifierDelai(
  acteur: Acteur,
  delaiId: bigint,
  donnees: DonneesDelai
): Promise<void> {
  valider(donnees)

  const avant = await prisma.sla_delais.findUniqueOrThrow({ where: { id: delaiId } })

  const valeurs = {
    valeur: donnees.valeur,
    unite: donnees.unite,
    est_valide_metier: donnees.estValideMetier,
    notes: donnees.notes,
  }

  await prisma.sla_delais.update({
    where: { id: delaiId },
    data: { ...valeurs, updated_at: new Date() },
  })

  // Le calcul d'échéance met les délais en cache : sans cette purge, une valeur corrigée
  // resterait sans effet jusqu'à l'expiration du cache — et l'administrateur croirait avoir agi.
  viderCacheDelais()

  const ecart = difference(avant as unknown as ValeursAudit, valeurs)

  if (sansChangement(ecart)) return

  await journaliser({
    action: 'sla_delai.modifie',
    acteurId: acteur.id,
    auditableType: MODELES.slaDelai,
    auditableId: String(delaiId),
    anciennes: ecart.anciennes,
    nouvelles: ecart.nouvelles,
  })
}
