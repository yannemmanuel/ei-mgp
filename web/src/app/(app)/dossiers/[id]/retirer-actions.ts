"use server";

import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/server/auth";
import { aPermission } from "@/server/authz";
import { ErreurWorkflow } from "@/server/services/dossier/workflow";
import { retirerDeclaration } from "@/server/services/administration/politique-suppression";
import type { EtatAction } from "./actions";

export async function actionRetirerDeclaration(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  const acteur = await utilisateurCourant();
  if (!acteur || !aPermission(acteur, "users.manage"))
    return { erreur: "Action non autorisée." };
  const dossierId = String(donnees.get("dossierId") ?? "");
  try {
    await retirerDeclaration(acteur, dossierId);
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof ErreurWorkflow
          ? erreur.message
          : "Le retrait a échoué.",
    };
  }
  redirect("/dossiers");
}
