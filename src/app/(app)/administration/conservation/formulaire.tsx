"use client";

import { useActionState } from "react";
import { ArchiveRestore, ShieldCheck } from "lucide-react";
import {
  useActualiserApresSucces,
  useRetourEnToast,
} from "@/lib/retour-operation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionEnregistrerPolitique } from "./actions";

export function FormulaireConservation({
  autorisee,
  delaiJours,
}: {
  autorisee: boolean;
  delaiJours: number;
}) {
  const [etat, action, enCours] = useActionState(
    actionEnregistrerPolitique,
    {},
  );
  useRetourEnToast(etat);
  useActualiserApresSucces(etat);

  return (
    <form
      action={action}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <Card>
        <CardHeader className="border-b border-border/70">
          <CardTitle className="flex items-center gap-2">
            <ArchiveRestore className="h-5 w-5 text-primary-700" />
            Retrait des déclarations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-border/80 bg-secondary-50/50 p-4">
            <span>
              <span className="block font-semibold text-secondary-900">
                Autoriser le retrait depuis le backoffice
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Réservé aux administrateurs habilités. Le contenu personnel est
                effacé et la trace d’audit est conservée.
              </span>
            </span>
            <input
              type="checkbox"
              name="autorisee"
              defaultChecked={autorisee}
              className="mt-1 h-5 w-5 accent-primary"
            />
          </label>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="delaiJours">Délai minimal avant retrait</Label>
            <div className="relative">
              <Input
                id="delaiJours"
                name="delaiJours"
                type="number"
                min="0"
                max="3650"
                defaultValue={delaiJours}
                className="pr-16"
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                jours
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Utilisez 0 pour permettre un retrait immédiat.
            </p>
          </div>
          <Button type="submit" disabled={enCours}>
            {enCours ? "Enregistrement…" : "Enregistrer la politique"}
          </Button>
        </CardContent>
      </Card>
      <Card className="border-primary-100 bg-primary-50/50">
        <CardContent className="pt-5">
          <ShieldCheck className="h-8 w-8 text-primary-700" />
          <h2 className="mt-4 font-semibold text-secondary-900">
            Suppression responsable
          </h2>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-secondary-700">
            <li>• Les pièces jointes sont détruites.</li>
            <li>• Les textes libres et identités sont effacés.</li>
            <li>• Le dossier est retiré des vues de travail.</li>
            <li>• La référence et la trace d’audit subsistent.</li>
          </ul>
        </CardContent>
      </Card>
    </form>
  );
}
