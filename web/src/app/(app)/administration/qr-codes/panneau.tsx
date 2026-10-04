"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Download, QrCode, ScanLine, ShieldCheck } from "lucide-react";
import {
  useActualiserApresSucces,
  useRetourEnToast,
} from "@/lib/retour-operation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EtatFormulaire } from "../editeur-referentiel";
import { BoutonSupprimer } from "../bouton-supprimer";
import { actionSupprimerQrCode } from "../suppressions-actions";
import {
  actionBasculerQrCode,
  actionGenererQrCode,
  actionModifierUrlCible,
} from "./actions";

export type QrCodeVue = {
  id: string;
  token: string;
  urlCible: string;
  actif: boolean;
  parcours: string;
  genereLe: string;
  genererPar: string;
  svg: string;
};

const ETAT: EtatFormulaire = {};

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));

export function PanneauQrCodes({
  qrCodes,
  parcours,
}: {
  qrCodes: QrCodeVue[];
  parcours: { id: string; libelle: string }[];
}) {
  const [etatGeneration, generer, generationEnCours] = useActionState(
    actionGenererQrCode,
    ETAT,
  );
  useRetourEnToast(etatGeneration);
  useActualiserApresSucces(etatGeneration);

  return (
    <div className="space-y-6">
      <div>
        <EnTetePage
          titre="QR codes"
          lede="Tous les codes mènent au même écran, où le déclarant choisit lui-même. Un seul support à imprimer."
          mailles={[
            { libelle: "Administration", href: "/administration" },
            { libelle: "QR codes" },
          ]}
        />
        <p className="mt-2 text-caption text-muted-foreground">
          Un code peut être retiré de la circulation même une fois imprimé.
        </p>
      </div>

      <Card className="border-primary-100 bg-gradient-to-br from-white to-primary-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-h3">
            <QrCode className="h-5 w-5 text-primary-700" />
            Générer un nouveau support
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={generer} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <Label
                htmlFor="parcoursId"
                className="text-caption text-muted-foreground"
              >
                Parcours de rattachement (documentaire)
              </Label>
              <select
                id="parcoursId"
                name="parcoursId"
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— Sélectionner —</option>
                {parcours.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.libelle}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={generationEnCours}>
              {generationEnCours ? "Génération…" : "Générer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {qrCodes.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Aucun QR code généré.</p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {qrCodes.map((code) => (
            <FicheQrCode key={code.id} code={code} />
          ))}
        </div>
      )}
    </div>
  );
}

function FicheQrCode({ code }: { code: QrCodeVue }) {
  const [ouvert, setOuvert] = useState(false);
  const [etatUrl, enregistrerUrl, urlEnCours] = useActionState(
    actionModifierUrlCible,
    ETAT,
  );
  const [etatBascule, basculer, basculeEnCours] = useActionState(
    actionBasculerQrCode,
    ETAT,
  );

  useRetourEnToast(etatUrl);
  useRetourEnToast(etatBascule);
  useActualiserApresSucces(etatUrl);
  useActualiserApresSucces(etatBascule);

  return (
    <Card className="group overflow-hidden p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg">
      <div className="h-1.5 bg-gradient-to-r from-primary-600 via-primary-400 to-accent-500" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-secondary-900">
              {code.parcours}
            </p>
            <p className="text-caption text-muted-foreground">
              Généré le {dateFr(code.genereLe)} par {code.genererPar}
            </p>
          </div>
          <Badge variant={code.actif ? "default" : "secondary"}>
            {code.actif ? "Actif" : "Retiré"}
          </Badge>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-2xl border border-secondary-100 bg-white p-5 shadow-inner">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary-50/70 to-transparent" />
          <div className="relative flex justify-center">
            <Image
              src={code.svg}
              alt={`QR code ${code.parcours}`}
              width={220}
              height={220}
              unoptimized
              className={code.actif ? "" : "opacity-35 grayscale"}
            />
          </div>
          <div className="relative mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-secondary-700">
            <ScanLine className="h-4 w-4 text-primary-700" aria-hidden />
            Scannez pour faire une déclaration
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-secondary-50 px-3 py-2">
          <span className="truncate font-mono text-[10px] text-secondary-500">
            {code.token}
          </span>
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-primary-700"
            aria-label="Lien sécurisé"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={
              <a
                href={code.svg}
                download={`qr-declaration-${code.parcours.toLowerCase().replaceAll(" ", "-")}.svg`}
              />
            }
          >
            <Download className="h-4 w-4" aria-hidden />
            Télécharger
          </Button>
          <form action={basculer}>
            <input type="hidden" name="qrCodeId" value={code.id} />
            <Button
              type="submit"
              size="sm"
              variant={code.actif ? "outline" : "default"}
              disabled={basculeEnCours}
            >
              {code.actif
                ? "Retirer de la circulation"
                : "Remettre en circulation"}
            </Button>
          </form>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOuvert((v) => !v)}
          >
            URL cible
          </Button>

          {/*
          ⚠️ « Retirer de la circulation » suffit presque toujours, et vaut mieux.

          Les deux se comportent pareil pour qui scanne l'affiche. Mais un code retiré reste
          identifiable dans le journal et se remet en circulation si l'affiche est encore au mur ;
          un code supprimé ne revient pas.
        */}
          <BoutonSupprimer
            id={code.id}
            nom={code.token}
            action={actionSupprimerQrCode}
          />
        </div>

        {ouvert && (
          <form
            action={enregistrerUrl}
            className="mt-3 space-y-2 border-t border-border pt-3"
          >
            <input type="hidden" name="qrCodeId" value={code.id} />

            <Label
              htmlFor={`url-${code.id}`}
              className="text-caption text-muted-foreground"
            >
              URL cible
            </Label>
            <Input
              id={`url-${code.id}`}
              name="urlCible"
              defaultValue={code.urlCible}
            />

            {/* Voir MIGRATION_PLAN.md : la baisse de confiance vient de la baseline, où cet écran
              laisse croire à une réorientation qui n'a jamais lieu. */}
            <p className="text-caption text-muted-foreground">
              Valeur documentaire : la redirection mène toujours à l’écran de
              choix.
            </p>

            <Button type="submit" size="sm" disabled={urlEnCours}>
              {urlEnCours ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
