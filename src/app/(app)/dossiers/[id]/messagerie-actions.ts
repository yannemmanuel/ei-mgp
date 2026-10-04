"use server";

import { exigerUtilisateur } from "@/server/auth";
import { peutEnvoyerMessage } from "@/server/authz";
import { ErreurWorkflow } from "@/server/services/dossier/workflow";
import { envoyerMessage } from "@/server/services/messagerie/messagerie";
import type { EtatAction } from "./actions";
import { revaliderDossier } from "@/server/revalidation";
import { chargerDossierPourAutorisation } from "@/server/services/dossier/autorisation";

/**
 * Messagerie côté ACTEUR authentifié (EX-NOT-07).
 *
 * Symétrique de `(public)/suivi/messagerie-actions.ts`, mais l'autorisation passe ici par
 * `MessagePolicy` — permission `messagerie.send` ET cloisonnement par parcours. Aucune limite de
 * débit : elle ne protège que le canal public, un compte interne étant déjà tracé et révocable.
 */

const REFUS = "Vous n'êtes pas autorisé à effectuer cette action.";

export async function actionEnvoyerMessageAgent(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  const utilisateur = await exigerUtilisateur();
  const dossierId = String(donnees.get("dossierId") ?? "");

  const dossier = await chargerDossierPourAutorisation(dossierId, utilisateur);

  if (!dossier) return { erreur: REFUS };

  if (!peutEnvoyerMessage(utilisateur, dossier)) {
    return { erreur: REFUS };
  }

  try {
    await envoyerMessage({
      dossierId,
      expediteur: "agent",
      corps: String(donnees.get("corps") ?? ""),
      expediteurUserId: utilisateur.id,
    });
  } catch (erreur) {
    if (erreur instanceof ErreurWorkflow) return { erreur: erreur.message };

    console.error("Envoi de message agent en échec", erreur);
    return {
      erreur: "Le message n'a pas pu être envoyé. Vous pouvez réessayer.",
    };
  }

  revaliderDossier(dossierId);
  return { succes: "Message envoyé." };
}
