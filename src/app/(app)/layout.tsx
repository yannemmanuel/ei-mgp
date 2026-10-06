import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/server/auth";
import { LIBELLES_ROLE } from "@/server/authz";
import { BarreLaterale } from "@/components/layout/barre-laterale";
import { EnTete } from "@/components/layout/en-tete";
import { navigationPour } from "@/components/layout/navigation";
import { MarqueSodeci } from "@/components/ui/marque-sodeci";
import { prisma } from "@/lib/prisma";
import {
  nombreNonLues,
  notificationsRecentes,
} from "@/server/services/notification/boite";
import { seDeconnecter } from "./actions";

export default async function LayoutApplication({
  children,
}: LayoutProps<"/">) {
  const utilisateur = await exigerUtilisateur();

  if (utilisateur.doitChangerMotDePasse) {
    redirect("/mot-de-passe");
  }

  const sections = navigationPour(utilisateur);

  const [profil, notifications, nonLues, libellesRoles] = await Promise.all([
    prisma.users.findUnique({
      where: { id: utilisateur.id },
      select: {
        name: true,
        sites: { select: { libelle: true } },
        directions: {
          select: { libelle: true, sites: { select: { libelle: true } } },
        },
      },
    }),
    notificationsRecentes(utilisateur.id),
    nombreNonLues(utilisateur.id),
    prisma.roles.findMany({
      where: { name: { in: [...utilisateur.roles] } },
      select: { name: true, libelle: true },
    }),
  ]);

  const libelleDuRole = new Map(libellesRoles.map((r) => [r.name, r.libelle]));
  const rattachement = profil?.sites
    ? `Site : ${profil.sites.libelle}`
    : profil?.directions?.sites
      ? `Site : ${profil.directions.sites.libelle}`
      : profil?.directions
        ? `Direction : ${profil.directions.libelle}`
        : null;

  return (
    <div className="app-shell flex min-h-screen flex-col bg-background lg:flex-row">
      <a
        href="#contenu-principal"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-lg bg-secondary-900 px-4 py-2 text-sm font-semibold text-white shadow-xl transition-transform focus:translate-y-0"
      >
        Aller au contenu
      </a>
      {/* Barre latérale desktop */}
      <aside className="hidden w-[16.5rem] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          {/* En-tête marque SODECI */}
          <div className="flex h-18 shrink-0 items-center border-b border-sidebar-border px-5">
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <MarqueSodeci tailleLogo="h-8" sousTitre="Plaintes et évènements indésirables" />
            </Link>
          </div>

          {/* Navigation avec défilement fluide */}
          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            <BarreLaterale sections={sections} />
          </div>

          {/* Pied de barre latérale institutionnel */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/70 px-3 py-2.5 text-[11px] text-secondary-700">
              <span
                className="h-2 w-2 rounded-full bg-primary-600"
                aria-hidden
              />
              <span className="font-medium">Session sécurisée</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <EnTete
          nom={profil?.name ?? ""}
          roles={utilisateur.roles.map(
            (role) => libelleDuRole.get(role) ?? LIBELLES_ROLE[role] ?? role,
          )}
          rattachement={rattachement}
          sections={sections}
          actionDeconnexion={seDeconnecter}
          notifications={notifications}
          nonLues={nonLues}
        />
        <main
          id="contenu-principal"
          tabIndex={-1}
          className="flex-1 outline-none"
        >
          <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8 xl:px-10 xl:py-9">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
