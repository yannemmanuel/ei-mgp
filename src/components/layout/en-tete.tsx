"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  KeyRound,
  LogOut,
  Menu,
  ChevronDown,
  LayoutDashboard,
  MapPin,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MarqueSodeci } from "@/components/ui/marque-sodeci";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NotificationVue } from "@/server/services/notification/boite";
import type { SectionNavigation } from "./navigation";
import { BarreLaterale } from "./barre-laterale";
import { ClocheNotifications } from "./cloche-notifications";

type Props = {
  nom: string;
  roles: readonly string[];
  rattachement: string | null;
  sections: SectionNavigation[];
  actionDeconnexion: () => Promise<void>;
  notifications: NotificationVue[];
  nonLues: number;
};

function initiales(nom: string): string {
  const mots = nom
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (mots.length === 0) return "?";
  return (
    mots[0][0] + (mots.length > 1 ? mots[mots.length - 1][0] : "")
  ).toUpperCase();
}

export function EnTete({
  nom,
  roles,
  rattachement,
  sections,
  actionDeconnexion,
  notifications,
  nonLues,
}: Props) {
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const chemin = usePathname();
  const lienActif = sections
    .flatMap((section) => section.liens)
    .filter(
      (lien) => chemin === lien.href || chemin.startsWith(`${lien.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  const titrePage = lienActif?.libelle ?? "Espace de travail";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border/80 bg-card/94 px-4 shadow-[0_1px_12px_rgba(18,33,59,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/85 sm:px-6 lg:h-18 lg:px-8">
      {/* Navigation repliée en tiroir sous le point de rupture lg */}
      <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 rounded-lg border border-border/50 text-secondary-600 hover:text-secondary-900"
              aria-label="Ouvrir la navigation"
            />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[18rem] border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Navigation principale</SheetTitle>
          <div className="flex h-20 items-center border-b border-sidebar-border px-5">
            <MarqueSodeci tailleLogo="h-8" sousTitre="Plaintes et évènements indésirables" />
          </div>
          <div className="py-4">
            <BarreLaterale
              sections={sections}
              onNaviguer={() => setTiroirOuvert(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary-500 lg:block">
          Espace de travail
        </p>
        <p className="truncate text-sm font-semibold tracking-tight text-secondary-900 lg:mt-0.5 lg:text-base">
          {titrePage}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {chemin !== "/dashboard" && (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/dashboard" />}
            className="hidden h-9 gap-2 rounded-lg text-xs font-medium text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900 md:inline-flex"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Vue d’ensemble
          </Button>
        )}
        {rattachement && (
          <div className="hidden max-w-56 items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50/70 px-3 py-1.5 text-[11px] font-medium text-primary-900 lg:flex">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{rattachement}</span>
          </div>
        )}
        <ClocheNotifications notifications={notifications} nonLues={nonLues} />

        <div className="h-6 w-px bg-border/60 mx-1 hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="group h-10 gap-2.5 rounded-full border border-border/60 pl-1.5 pr-3 py-1 hover:border-border hover:bg-secondary-50/80 transition-all duration-200 cursor-pointer"
                aria-label={`Compte de ${nom}`}
              />
            }
          >
            <div className="relative">
              <Avatar className="h-7 w-7 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary-100 text-[11px] font-bold text-primary-800">
                  {initiales(nom)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>

            <div className="hidden flex-col items-start text-left sm:flex">
              <span className="max-w-36 truncate text-xs font-semibold text-secondary-900 leading-tight">
                {nom}
              </span>
              <span className="max-w-36 truncate text-[10px] text-muted-foreground leading-tight">
                {roles[0] ?? "Utilisateur"}
              </span>
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-secondary-400 group-hover:text-secondary-600 transition-transform group-data-[state=open]:rotate-180" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-64 p-1.5 shadow-xl rounded-xl border-border/80"
          >
            <div className="px-3 py-2 bg-muted/40 rounded-lg mb-1">
              <p className="truncate text-xs font-semibold text-secondary-900">
                {nom}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground font-medium">
                {roles.length === 0 ? "Aucun rôle attribué" : roles.join(" • ")}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-secondary-700">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{rattachement ?? "Aucun rattachement"}</span>
              </p>
            </div>

            <DropdownMenuItem
              render={<Link href="/mot-de-passe" />}
              className="rounded-lg gap-2.5 py-2 text-xs font-medium cursor-pointer"
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
              Changer mon mot de passe
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem
              render={
                <button type="submit" form="deconnexion" className="w-full" />
              }
              className="rounded-lg gap-2.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive cursor-pointer"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <form id="deconnexion" action={actionDeconnexion} className="hidden" />
      </div>
    </header>
  );
}
