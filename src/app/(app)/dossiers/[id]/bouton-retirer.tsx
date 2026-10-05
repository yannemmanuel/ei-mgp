"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRetourEnToast } from "@/lib/retour-operation";
import { actionRetirerDeclaration } from "./retirer-actions";

export function BoutonRetirer({
  dossierId,
  indisponible,
}: {
  dossierId: string;
  indisponible?: string;
}) {
  const [etat, action, enCours] = useActionState(actionRetirerDeclaration, {});
  useRetourEnToast(etat);
  return (
    <form
      action={action}
      title={indisponible}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Retirer cette déclaration ? Ses données personnelles et pièces jointes seront définitivement effacées.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="dossierId" value={dossierId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={enCours || Boolean(indisponible)}
        className="border-destructive/40 text-destructive hover:bg-destructive/5 disabled:border-border disabled:text-muted-foreground"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {enCours ? "Suppression…" : "Supprimer la déclaration"}
      </Button>
      {indisponible && (
        <p className="mt-1 max-w-72 text-right text-[11px] leading-4 text-muted-foreground">
          {indisponible}
        </p>
      )}
    </form>
  );
}
