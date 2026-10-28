"use client";

import { useActionState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useActualiserApresSucces,
  useRetourEnToast,
} from "@/lib/retour-operation";
import { actionReintegrerDeclaration } from "./actions";

export function BoutonReintegrer({
  dossierId,
  reference,
}: {
  dossierId: string;
  reference: string;
}) {
  const [etat, action, enCours] = useActionState(
    actionReintegrerDeclaration,
    {},
  );
  useRetourEnToast(etat);
  useActualiserApresSucces(etat);

  return (
    <form
      action={action}
      onSubmit={(evenement) => {
        if (
          !window.confirm(
            `Réintégrer ${reference} à son étape précédente ? Les données personnelles, textes et pièces jointes déjà effacés ne seront pas restaurés.`,
          )
        ) {
          evenement.preventDefault();
        }
      }}
    >
      <input type="hidden" name="dossierId" value={dossierId} />
      <Button type="submit" size="sm" disabled={enCours}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        {enCours ? "Réintégration…" : "Réintégrer"}
      </Button>
    </form>
  );
}
