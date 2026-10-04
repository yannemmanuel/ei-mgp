"use server";

import { prisma } from "@/lib/prisma";
import { exigerUtilisateur } from "@/server/auth";
import {
  peutCreerInvestigation,
  peutModifierInvestigation,
} from "@/server/authz";
import {
  mettreAJourInvestigation,
  ouvrirInvestigation,
} from "@/server/services/investigation/investigation";
import { ErreurWorkflow } from "@/server/services/dossier/workflow";
import type { EtatAction } from "./actions";
import { revaliderDossier } from "@/server/revalidation";
import { chargerDossierPourAutorisation } from "@/server/services/dossier/autorisation";

/**
 * Actions du module Investigations (EX-INV-01 à 04).
 *
 * Comme pour les actions de dossier, l'autorisation est revérifiée ici à chaque appel : le
 * masquage d'un bouton n'est jamais un contrôle d'accès.
 *
 * ⚠️ `actionSoumettreInvestigation` et `actionValiderInvestigation` ont été SUPPRIMÉES : une
 * investigation n'est soumise à aucune validation (décision métier du 2026-09-18). Une Server
 * Action laissée en place serait restée appelable directement, sans passer par aucun écran.
 */

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action.";

function messageErreur(erreur: unknown): string {
  if (erreur instanceof ErreurWorkflow) return erreur.message;

  console.error("Action investigation en échec", erreur);
  return "L'opération n'a pas pu aboutir. Aucune donnée n'a été perdue : vous pouvez réessayer.";
}

/** Contexte d'autorisation d'une investigation : parcours du dossier parent + enquêteur. */
async function contexteInvestigation(
  investigationId: string,
  utilisateur: Awaited<ReturnType<typeof exigerUtilisateur>>,
) {
  const investigation = await prisma.investigations.findUnique({
    where: { id: investigationId },
    select: {
      id: true,
      enqueteur_id: true,
      dossier_id: true,
    },
  });

  if (!investigation) return null;

  const dossier = await chargerDossierPourAutorisation(
    investigation.dossier_id,
    utilisateur,
  );
  if (!dossier) return null;

  return {
    dossierId: investigation.dossier_id,
    ...dossier,
    enqueteurId: investigation.enqueteur_id,
  };
}

function donneesDepuis(donnees: FormData) {
  return {
    faitsConstates: String(donnees.get("faitsConstates") ?? ""),
    personnesRencontrees:
      String(donnees.get("personnesRencontrees") ?? "") || null,
    causeImmediate: String(donnees.get("causeImmediate") ?? "") || null,
    causesRacines: String(donnees.get("causesRacines") ?? "") || null,
    recommandations: String(donnees.get("recommandations") ?? ""),
  };
}

export async function actionOuvrirInvestigation(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur();
  const dossierId = String(donnees.get("dossierId") ?? "");
  const dossier = await chargerDossierPourAutorisation(dossierId, utilisateur);

  if (
    !dossier ||
    !peutCreerInvestigation(utilisateur, {
      ...dossier,
      enqueteurId: utilisateur.id,
    })
  ) {
    return { erreur: REFUS };
  }

  const dateBrute = String(donnees.get("dateOuverture") ?? "");
  const dateOuverture = dateBrute ? new Date(dateBrute) : new Date();

  if (Number.isNaN(dateOuverture.getTime())) {
    return { erreur: "Merci d’indiquer une date d’ouverture valide." };
  }

  try {
    await ouvrirInvestigation({
      dossierId,
      enqueteurId: utilisateur.id,
      dateOuverture,
      donnees: donneesDepuis(donnees),
    });
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }

  revaliderDossier(dossierId);
  return { succes: "Fiche d’investigation ouverte." };
}

export async function actionMettreAJourInvestigation(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur();
  const investigationId = String(donnees.get("investigationId") ?? "");
  const contexte = await contexteInvestigation(investigationId, utilisateur);

  if (!contexte || !peutModifierInvestigation(utilisateur, contexte)) {
    return { erreur: REFUS };
  }

  try {
    await mettreAJourInvestigation({
      investigationId,
      donnees: donneesDepuis(donnees),
    });
  } catch (erreur) {
    return { erreur: messageErreur(erreur) };
  }

  revaliderDossier(contexte.dossierId);
  return { succes: "Fiche mise à jour." };
}
