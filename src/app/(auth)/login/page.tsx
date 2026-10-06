import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/server/auth";
import { FormulaireConnexion } from "./formulaire-connexion";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { MarqueSodeci } from "@/components/ui/marque-sodeci";

export const metadata: Metadata = {
  title: "Connexion — EI-MGP",
  description:
    "Mécanisme de Gestion des Plaintes et Évènements Indésirables — SODECI",
};

export default async function PageConnexion() {
  if (await utilisateurCourant()) {
    redirect("/dashboard");
  }

  return (
    <main
      id="contenu-principal"
      tabIndex={-1}
      className="grid min-h-screen bg-background lg:grid-cols-[minmax(24rem,0.85fr)_1.15fr]"
    >
      <section className="brand-panel relative hidden overflow-hidden border-r border-secondary-100 p-12 text-secondary-900 lg:flex lg:flex-col xl:p-16">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,#1f386418_1px,transparent_1.5px)] bg-[size:1.5rem_1.5rem] opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
          aria-hidden
        />
        <div className="relative">
          <MarqueSodeci tailleLogo="h-12" prioritaire />
        </div>
        <div className="relative mt-auto max-w-md pb-8">
          <p className="text-[2.75rem] font-semibold leading-[1.08] tracking-[-0.04em]">
            Piloter chaque signalement avec rigueur.
          </p>
          <p className="mt-5 text-sm leading-6 text-secondary-600">
            Un espace de travail dédié au traitement confidentiel des plaintes
            et événements indésirables.
          </p>
          <div className="mt-8 flex items-center gap-3 border-t border-secondary-200 pt-6 text-xs text-secondary-600">
            <ShieldCheck className="h-5 w-5 text-primary-700" aria-hidden />
            <span>Accès réservé aux équipes habilitées</span>
          </div>
        </div>
      </section>

      <section className="surface-grid flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <MarqueSodeci tailleLogo="h-10" prioritaire />
          </div>
          <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-[0_24px_70px_rgba(18,33,59,0.10)] sm:p-9">
            <div className="mb-8">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary-50 text-secondary-700">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
                Espace interne
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-secondary-900">
                Heureux de vous revoir.
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Connectez-vous pour accéder à votre espace de traitement.
              </p>
            </div>
            <FormulaireConnexion />
            <div className="mt-8 flex items-center justify-center gap-2 border-t border-border/70 pt-5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary-700" aria-hidden />
              <span>Accès sécurisé · Données confidentielles</span>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} SODECI · Tous droits réservés
          </p>
        </div>
      </section>
    </main>
  );
}
