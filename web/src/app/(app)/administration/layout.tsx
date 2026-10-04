import { exigerUtilisateur } from "@/server/auth";
import { aPermission, type Permission } from "@/server/authz";
import { NavigationAdministration } from "@/components/layout/navigation-administration";

const LIENS: readonly {
  href: string;
  libelle: string;
  permission: Permission;
}[] = [
  {
    href: "/administration/utilisateurs",
    libelle: "Utilisateurs",
    permission: "users.manage",
  },
  {
    href: "/administration/habilitations",
    libelle: "Habilitations",
    permission: "roles.manage",
  },
  {
    href: "/administration/conservation",
    libelle: "Conservation",
    permission: "users.manage",
  },
  {
    href: "/administration/statuts",
    libelle: "Statuts",
    permission: "referentiels.statuts.manage",
  },
  {
    href: "/administration/delais",
    libelle: "Délais",
    permission: "referentiels.delais.manage",
  },
  {
    href: "/administration/gravites",
    libelle: "Gravités",
    permission: "referentiels.gravites.manage",
  },
  {
    href: "/administration/categories",
    libelle: "Catégories",
    permission: "referentiels.categories.manage",
  },
  {
    href: "/administration/familles-risque",
    libelle: "Risques",
    permission: "referentiels.categories.manage",
  },
  {
    href: "/administration/organisation",
    libelle: "Organisation",
    permission: "referentiels.sites.manage",
  },
  {
    href: "/administration/postes",
    libelle: "Postes",
    permission: "referentiels.sites.manage",
  },
  {
    href: "/administration/listes-formulaires",
    libelle: "Formulaires",
    permission: "referentiels.categories.manage",
  },
  {
    href: "/administration/canaux",
    libelle: "Canaux",
    permission: "canaux.manage",
  },
  {
    href: "/administration/notifications",
    libelle: "Notifications",
    permission: "notifications.templates.manage",
  },
  {
    href: "/administration/qr-codes",
    libelle: "QR codes",
    permission: "qrcodes.manage",
  },
];

export default async function LayoutAdministration({
  children,
}: LayoutProps<"/administration">) {
  const utilisateur = await exigerUtilisateur();
  const liens = LIENS.filter((lien) =>
    aPermission(utilisateur, lien.permission),
  ).map(({ href, libelle }) => ({ href, libelle }));
  return (
    <>
      <NavigationAdministration liens={liens} />
      {children}
    </>
  );
}
