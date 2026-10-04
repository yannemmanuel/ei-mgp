"use server";

import { revalidatePath } from "next/cache";
import { utilisateurCourant } from "@/server/auth";
import { aPermission } from "@/server/authz";
import { ErreurWorkflow } from "@/server/services/dossier/workflow";
import { enregistrerPolitiqueSuppression } from "@/server/services/administration/politique-suppression";
import type { EtatFormulaire } from "../editeur-referentiel";

export async function actionEnregistrerPolitique(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const acteur = await utilisateurCourant();
  if (!acteur || !aPermission(acteur, "users.manage"))
    return { erreur: "Action non autorisée." };

  try {
    await enregistrerPolitiqueSuppression(acteur, {
      autorisee: donnees.get("autorisee") === "on",
      delaiJours: Number(donnees.get("delaiJours")),
    });
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof ErreurWorkflow
          ? erreur.message
          : "L’enregistrement a échoué.",
    };
  }

  revalidatePath("/administration/conservation");
  return { succes: "Politique de suppression enregistrée." };
}
