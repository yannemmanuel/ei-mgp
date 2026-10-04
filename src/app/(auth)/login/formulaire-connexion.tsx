"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { seConnecter, type EtatConnexion } from "./actions";
import { useRetourEnToast } from "@/lib/retour-operation";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";

const ETAT_INITIAL: EtatConnexion = {};

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, ETAT_INITIAL);
  const [afficheMotDePasse, setAfficheMotDePasse] = useState(false);
  const erreurId = etat.erreur ? "connexion-erreur" : undefined;
  useRetourEnToast(etat);

  return (
    <form action={action} aria-busy={enCours} className="space-y-4">
      <div className="space-y-1.5">
        <Label
          htmlFor="email"
          className="text-xs font-semibold text-secondary-800"
        >
          Adresse e-mail
        </Label>
        <div className="relative group">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-primary-700">
            <Mail className="h-4 w-4" aria-hidden />
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="nom.prenom@sodeci.ci"
            required
            aria-invalid={etat.erreur ? true : undefined}
            aria-describedby={erreurId}
            className="h-12 rounded-xl border-input bg-white pl-10 text-sm text-secondary-900 shadow-xs placeholder:text-muted-foreground/70 hover:border-secondary-300 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="password"
            className="text-xs font-semibold text-secondary-800"
          >
            Mot de passe
          </Label>
          <Link
            href="/mot-de-passe"
            className="text-xs font-semibold text-primary-700 underline-offset-4 hover:underline"
          >
            Oublié ?
          </Link>
        </div>
        <div className="relative group">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-primary-700">
            <Lock className="h-4 w-4" aria-hidden />
          </div>
          <Input
            id="password"
            name="password"
            type={afficheMotDePasse ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            required
            aria-invalid={etat.erreur ? true : undefined}
            aria-describedby={erreurId}
            className="h-12 rounded-xl border-input bg-white pl-10 pr-11 text-sm text-secondary-900 shadow-xs placeholder:text-muted-foreground/70 hover:border-secondary-300 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
          <button
            type="button"
            onClick={() => setAfficheMotDePasse(!afficheMotDePasse)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            aria-label={
              afficheMotDePasse
                ? "Masquer le mot de passe"
                : "Afficher le mot de passe"
            }
            aria-pressed={afficheMotDePasse}
          >
            {afficheMotDePasse ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {etat.erreur && (
        <p
          id="connexion-erreur"
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {etat.erreur}
        </p>
      )}

      <Button
        type="submit"
        disabled={enCours}
        className="mt-3 h-12 w-full gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_rgba(0,166,81,0.18)] hover:bg-primary-500"
      >
        {enCours ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
            <span>Connexion en cours...</span>
          </>
        ) : (
          <>
            <span>Se connecter</span>
            <ArrowRight
              className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5"
              aria-hidden
            />
          </>
        )}
      </Button>
    </form>
  );
}
