"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardCheck,
  FolderOpen,
  Inbox,
  Settings,
  ShieldCheck,
  Wrench,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionNavigation } from "./navigation";

const ICONES: Record<string, LucideIcon> = {
  "chart-bar": BarChart3,
  folder: FolderOpen,
  clipboard: ClipboardCheck,
  wrench: Wrench,
  inbox: Inbox,
  cog: Settings,
  shield: ShieldCheck,
};

export function BarreLaterale({
  sections,
  onNaviguer,
}: {
  sections: SectionNavigation[];
  /** Referme le tiroir mobile après un clic : sans cela il masque la page qu'on vient d'ouvrir. */
  onNaviguer?: () => void;
}) {
  const cheminActuel = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="flex flex-col gap-5 px-3 text-sm"
    >
      {sections.map((section, index) => (
        <div key={section.titre ?? `section-${index}`} className="space-y-1">
          {section.titre && (
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-secondary-400">
              {section.titre}
            </p>
          )}

          <div className="space-y-1">
            {section.liens.map((lien) => {
              const cheminLien = lien.href.split("?")[0];
              const actif =
                cheminActuel === cheminLien ||
                cheminActuel.startsWith(`${cheminLien}/`);
              const Icone = ICONES[lien.icone] ?? FolderOpen;

              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  onClick={onNaviguer}
                  aria-current={actif ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150",
                    actif
                      ? "border border-primary-200/70 bg-primary-50 font-semibold text-primary-900 shadow-xs"
                      : "border border-transparent text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Indicateur lumineux gauche */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 h-5 w-1 rounded-full transition-all duration-200",
                        actif ? "bg-primary-600" : "bg-transparent",
                      )}
                    />
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                        actif
                          ? "bg-primary-100 text-primary-800"
                          : "bg-secondary-50 text-secondary-500 group-hover:bg-secondary-100 group-hover:text-secondary-800",
                      )}
                    >
                      <Icone className="h-4 w-4" aria-hidden />
                    </div>
                    <span className="truncate">{lien.libelle}</span>
                  </div>

                  {actif && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary-700" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
