import type { Metadata } from "next";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { exigerPermission } from "@/server/auth";
import { lirePolitiqueSuppression } from "@/server/services/administration/politique-suppression";
import { FormulaireConservation } from "./formulaire";

export const metadata: Metadata = { title: "Administration — Conservation" };
export const dynamic = "force-dynamic";

export default async function PageConservation() {
  await exigerPermission("users.manage");
  const politique = await lirePolitiqueSuppression();
  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Conservation des données"
        lede="Définissez quand une déclaration peut être retirée et ce qui doit rester traçable."
        mailles={[
          { libelle: "Administration", href: "/administration" },
          { libelle: "Conservation" },
        ]}
      />
      <FormulaireConservation {...politique} />
    </div>
  );
}
