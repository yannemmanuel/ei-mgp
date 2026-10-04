"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRetourEnToast } from "@/lib/retour-operation";
import { actionRetirerDeclaration } from "./retirer-actions";

export function BoutonRetirer({ dossierId }: { dossierId: string }) {
  const [etat, action, enCours] = useActionState(actionRetirerDeclaration, {});
  useRetourEnToast(etat);
  return (
    <form
      action={action}
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
        disabled={enCours}
        className="border-destructive/30 text-destructive hover:bg-destructive/5"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {enCours ? "Retrait…" : "Retirer la déclaration"}
      </Button>
    </form>
  );
}
