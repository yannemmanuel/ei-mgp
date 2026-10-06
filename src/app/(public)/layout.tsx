import Link from "next/link";
import { Shield, ChevronRight } from "lucide-react";
import { MarqueSodeci } from "@/components/ui/marque-sodeci";

const ETAPES = [
  {
    titre: "Décrivez les faits",
    description: "Lieu, date, ce qui s\u2019est passé.",
  },
  {
    titre: "Recevez une référence",
    description: "Un numéro de dossier vous est remis immédiatement.",
  },
  {
    titre: "Suivez l\u2019avancement",
    description: "Consultez l\u2019état de votre dossier à tout moment.",
  },
];

export default function LayoutPublic({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Panneau latéral de réassurance */}
      <aside className="brand-panel relative overflow-hidden border-b border-secondary-100 px-4 py-4 text-secondary-900 sm:px-6 lg:flex lg:w-[28rem] lg:shrink-0 lg:border-b-0 lg:border-r lg:px-12 lg:py-10 xl:w-[31rem]">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,#1f386418_1px,transparent_1.5px)] bg-[size:1.5rem_1.5rem] opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent_80%)] pointer-events-none"
          aria-hidden
        />

        <div className="relative z-10 flex w-full flex-col lg:min-h-[calc(100vh-5rem)]">
          <div className="flex items-center justify-between gap-4 lg:block">
            <Link
              href="/declarer"
              className="group flex min-h-11 min-w-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <MarqueSodeci tailleLogo="h-9 lg:h-11" prioritaire />
            </Link>

            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 lg:hidden">
              <Shield className="h-3.5 w-3.5 text-primary-700" aria-hidden />
              <span className="text-xs font-semibold text-primary-800">
                Confidentiel
              </span>
            </div>
          </div>

          <div className="hidden pb-8 pt-12 lg:block xl:pt-16">
            <p className="max-w-sm text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.04em] text-secondary-900">
              Votre parole mérite une écoute sûre.
            </p>
            <p className="mt-5 max-w-sm text-sm leading-6 text-secondary-600">
              Chaque déclaration est enregistrée, suivie et traitée. Vous pouvez
              la déposer de manière totalement anonyme.
            </p>

            <ol className="mt-10 space-y-5 border-l border-secondary-200 pl-6">
              {ETAPES.map((etape, index) => (
                <li key={etape.titre} className="flex gap-3 items-start">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-100 text-[11px] font-bold text-primary-800">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-secondary-900">
                      {etape.titre}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-secondary-600">
                      {etape.description}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
              <Shield className="h-3.5 w-3.5 text-primary-400" aria-hidden />
              <span className="text-xs font-semibold text-primary-800">
                Traitement confidentiel garanti
              </span>
            </div>

            <p className="mt-6 text-xs text-secondary-600">
              Vous avez déjà déclaré ?{" "}
              <Link
                href="/suivi"
                className="inline-flex items-center gap-1 font-semibold text-primary-700 transition-colors hover:text-primary-900"
              >
                Suivre mon dossier
                <ChevronRight className="h-3 w-3" aria-hidden />
              </Link>
            </p>
          </div>
        </div>
      </aside>

      <main
        id="contenu-principal"
        tabIndex={-1}
        className="surface-grid relative flex flex-1 items-start px-4 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-10 xl:px-20 xl:py-12"
      >
        <div className="relative mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
