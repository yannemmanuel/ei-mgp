import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { viderCacheDelais, type EtapeDelai } from '../dossier/delais'
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
 * Modification seule : chaque couple (parcours, étape) est créé par le seeder, et le jeu d'étapes
 * est fixé par le graphe de statuts. En ajouter un ne produirait aucun effet — aucun statut ne
 * s'y rattacherait.
 */
export async function modifierDelai(
  acteur: Acteur,
  delaiId: bigint,
  donnees: DonneesDelai
): Promise<void> {
  if (!Number.isInteger(donnees.valeur) || donnees.valeur < 1) {
    throw new ErreurWorkflow('Le délai doit être un nombre entier d’au moins 1.')
  }

  if (!UNITES_DELAI.includes(donnees.unite)) {
    throw new ErreurWorkflow('Unité de délai inconnue.')
  }

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
