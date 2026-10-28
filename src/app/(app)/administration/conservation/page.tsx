import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveRestore, Search } from "lucide-react";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { Pagination } from "@/components/layout/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EtatVide } from "@/components/ui/etat-vide";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigerPermission } from "@/server/auth";
import {
  lirePolitiqueSuppression,
  listerDeclarationsRetirees,
} from "@/server/services/administration/politique-suppression";
import { BoutonReintegrer } from "./bouton-reintegrer";
import { FormulaireConservation } from "./formulaire";

export const metadata: Metadata = { title: "Administration — Conservation" };
export const dynamic = "force-dynamic";

const dateFr = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Abidjan",
      }).format(date)
    : "—";

export default async function PageConservation({
  searchParams,
}: PageProps<"/administration/conservation">) {
  await exigerPermission("users.manage");
  const params = await searchParams;
  const recherche =
    typeof params.recherche === "string" ? params.recherche.trim() : "";
  const pageDemandee =
    typeof params.page === "string" ? Number(params.page) : 1;
  const [politique, retirees] = await Promise.all([
    lirePolitiqueSuppression(),
    listerDeclarationsRetirees(
      recherche,
      Number.isInteger(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1,
    ),
  ]);

  return (
    <div className="space-y-8">
      <EnTetePage
        titre="Conservation des données"
        lede="Définissez quand une déclaration peut être retirée et ce qui doit rester traçable."
        mailles={[
          { libelle: "Administration", href: "/administration" },
          { libelle: "Conservation" },
        ]}
      />
      <FormulaireConservation {...politique} />

      <section className="space-y-4" aria-labelledby="declarations-retirees">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="declarations-retirees"
                className="text-h2 text-secondary-900"
              >
                Déclarations retirées
              </h2>
              <Badge variant="secondary">{retirees.total}</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Une réintégration replace le dossier à son statut précédent. Elle ne
              restaure pas les identités, textes libres ou pièces jointes déjà
              effacés.
            </p>
          </div>

          <form method="get" className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="recherche"
                defaultValue={recherche}
                placeholder="Rechercher une référence"
                aria-label="Rechercher une déclaration retirée"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline">
              Rechercher
            </Button>
            {recherche && (
              <Button
                variant="ghost"
                render={<Link href="/administration/conservation" />}
              >
                Effacer
              </Button>
            )}
          </form>
        </div>

        {retirees.declarations.length === 0 ? (
          <Card>
            <EtatVide
              icone={ArchiveRestore}
              titre={
                recherche
                  ? "Aucune référence ne correspond"
                  : "Aucune déclaration retirée"
              }
              description={
                recherche
                  ? "Modifiez la référence recherchée ou effacez le filtre."
                  : "Les déclarations retirées depuis le backoffice apparaîtront ici."
              }
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {retirees.declarations.map((declaration) => (
                <Card key={declaration.id}>
                  <CardContent className="space-y-4 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-secondary-900">
                          {declaration.reference}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {declaration.parcours.libelle}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {declaration.statuts_dossier.libelle_interne}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Retirée le</dt>
                        <dd className="mt-1 font-medium text-secondary-800">
                          {dateFr(declaration.archive_le)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Rattachement</dt>
                        <dd className="mt-1 font-medium text-secondary-800">
                          {declaration.directions?.libelle ??
                            declaration.sites?.libelle ??
                            "Non renseigné"}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                      <span className="text-xs text-amber-700">
                        Dossier anonymisé
                      </span>
                      <BoutonReintegrer
                        dossierId={declaration.id}
                        reference={declaration.reference}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut conservé</TableHead>
                    <TableHead>Rattachement</TableHead>
                    <TableHead>Date du retrait</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retirees.declarations.map((declaration) => (
                    <TableRow key={declaration.id}>
                      <TableCell className="font-semibold text-secondary-900">
                        {declaration.reference}
                      </TableCell>
                      <TableCell>{declaration.parcours.libelle}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {declaration.statuts_dossier.libelle_interne}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {declaration.directions?.libelle ??
                          declaration.sites?.libelle ??
                          "—"}
                      </TableCell>
                      <TableCell>{dateFr(declaration.archive_le)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <BoutonReintegrer
                            dossierId={declaration.id}
                            reference={declaration.reference}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Pagination
              base="/administration/conservation"
              parametres={params}
              page={retirees.page}
              pages={retirees.pages}
              total={retirees.total}
              unite="déclaration(s) retirée(s)"
            />
          </>
        )}
      </section>
    </div>
  );
}
