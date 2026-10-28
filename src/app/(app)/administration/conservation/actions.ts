"use server";

import { revalidatePath } from "next/cache";
import { utilisateurCourant } from "@/server/auth";
import { aPermission } from "@/server/authz";
import { ErreurWorkflow } from "@/server/services/dossier/workflow";
import {
  enregistrerPolitiqueSuppression,
  reintegrerDeclaration,
} from "@/server/services/administration/politique-suppression";
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

export async function actionReintegrerDeclaration(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const acteur = await utilisateurCourant();
  if (!acteur || !aPermission(acteur, "users.manage"))
    return { erreur: "Action non autorisée." };

  const dossierId = String(donnees.get("dossierId") ?? "");
  if (!dossierId) return { erreur: "Déclaration introuvable." };

  try {
    await reintegrerDeclaration(acteur, dossierId);
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof ErreurWorkflow
          ? erreur.message
          : "La réintégration a échoué. Vous pouvez réessayer.",
    };
  }

  revalidatePath("/administration/conservation");
  revalidatePath("/dossiers");
  revalidatePath("/dashboard");
  return {
    succes:
      "Déclaration réintégrée à son étape précédente. Les données effacées restent indisponibles.",
  };
}
