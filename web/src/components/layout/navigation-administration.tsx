"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type LienAdministration = { href: string; libelle: string };

export function NavigationAdministration({
  liens,
}: {
  liens: LienAdministration[];
}) {
  const chemin = usePathname();
  return (
    <nav
      aria-label="Navigation de l’administration"
      className="mb-6 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-secondary-50/60 px-4 py-2.5">
        <Settings2 className="h-4 w-4 text-primary-700" aria-hidden />
        <span className="text-xs font-semibold text-secondary-800">
          Administration
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-secondary-300" aria-hidden />
        <span className="text-[11px] text-muted-foreground">Accès rapide</span>
      </div>
      <div className="flex gap-1 overflow-x-auto p-2">
        <Link
          href="/administration"
          className={cn(
            "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            chemin === "/administration"
              ? "bg-primary-50 text-primary-800"
              : "text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900",
          )}
        >
          Vue d’ensemble
        </Link>
        {liens.map((lien) => {
          const actif =
            chemin === lien.href || chemin.startsWith(`${lien.href}/`);
          return (
            <Link
              key={lien.href}
              href={lien.href}
              aria-current={actif ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                actif
                  ? "bg-primary-50 text-primary-800 ring-1 ring-primary-100"
                  : "text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900",
              )}
            >
              {lien.libelle}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
