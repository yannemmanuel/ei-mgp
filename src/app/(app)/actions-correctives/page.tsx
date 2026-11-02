import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { BarreFiltres, type ChampFiltre } from "@/components/layout/barre-filtres";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { Pagination } from "@/components/layout/pagination";
import { Card } from "@/components/ui/card";
import { EtatVide } from "@/components/ui/etat-vide";
import { EtiquetteStatut, type TonStatut } from "@/components/ui/etiquette-statut";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigerUtilisateur } from "@/server/auth";
import { peutVoirListeActions } from "@/server/authz";
import type { StatutAction } from "@/server/services/action-corrective/action-corrective";
import {
  joursAvantEcheance,
  LIBELLES_STATUT_ACTION,
  listerActions,
  referentielsActions,
} from "@/server/services/action-corrective/liste";

export const metadata: Metadata = { title: "Actions correctives" };
export const dynamic = "force-dynamic";

const dateFr = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(date);

const TONS: Record<StatutAction, TonStatut> = {
  non_demarree: "neutre",
  en_cours: "encours",
  realisee: "succes",
  en_retard: "alerte",
};

function Echeance({ date, statut }: { date: Date; statut: StatutAction }) {
  const jours = joursAvantEcheance(date);
  const ton = jours < 0 ? "text-destructive" : jours <= 3 ? "text-accent-700" : "text-muted-foreground";

  return (
    <span className="text-sm">
      {dateFr(date)}
      {statut !== "realisee" && (
        <span className={`block text-caption font-medium ${ton}`}>
          {jours < 0
            ? `${Math.abs(jours)} j de retard`
            : jours === 0
              ? "Aujourd’hui"
              : `dans ${jours} j`}
        </span>
      )}
    </span>
  );
}

export default async function PageActionsCorrectives({
  searchParams,
}: PageProps<"/actions-correctives">) {
  const utilisateur = await exigerUtilisateur();
  if (!peutVoirListeActions(utilisateur)) redirect("/acces-refuse?droit=actions.view");

  const params = await searchParams;
  const lire = (cle: string) => {
    const valeur = params[cle];
    return typeof valeur === "string" && valeur !== "" ? valeur : undefined;
  };
  const filtres = {
    statut: lire("statut"),
    responsable: lire("responsable"),
    parcoursId: lire("parcoursId"),
    echeanceDebut: lire("echeanceDebut"),
    echeanceFin: lire("echeanceFin"),
  };
  const pageDemandee = Number(lire("page") ?? "1");
  const [resultat, referentiels] = await Promise.all([
    listerActions(utilisateur, filtres, Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1),
    referentielsActions(utilisateur),
  ]);
  const champs: ChampFiltre[] = [
    {
      type: "select",
      cle: "statut",
      libelle: "Statut",
      tous: "Tous",
      options: Object.entries(LIBELLES_STATUT_ACTION).map(([valeur, libelle]) => ({ valeur, libelle })),
    },
    {
      type: "select",
      cle: "parcoursId",
      libelle: "Parcours",
      tous: "Tous",
      options: referentiels.parcours.map((parcours) => ({ valeur: String(parcours.id), libelle: parcours.libelle })),
    },
    {
      type: "select",
      cle: "responsable",
      libelle: "Responsable",
      tous: "Tous",
      options: referentiels.responsables.map((nom) => ({ valeur: nom, libelle: nom })),
    },
    { type: "date", cle: "echeanceDebut", libelle: "Échéance à partir du" },
    { type: "date", cle: "echeanceFin", libelle: "Jusqu’au" },
  ];
  const filtree = champs.some((champ) => filtres[champ.cle as keyof typeof filtres]);

  return (
    <div className="space-y-5">
      <EnTetePage
        titre="Actions correctives"
        lede="Suivez et mettez à jour les actions décidées après investigation, par échéance."
        compteur={`${resultat.total} ${resultat.total > 1 ? "actions" : "action"}`}
      />
      <BarreFiltres base="/actions-correctives" champs={champs} valeurs={filtres} />

      {resultat.actions.length === 0 ? (
        <Card className="overflow-hidden p-0">
          <EtatVide
            icone={Wrench}
            titre={filtree ? "Aucune action ne correspond à ces critères." : "Aucune action corrective enregistrée."}
            description={filtree ? "Retirez un filtre pour élargir la recherche." : "Une action se crée depuis le dossier concerné."}
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" aria-label="Liste des actions correctives">
            {resultat.actions.map((action) => {
              const statut = action.statut as StatutAction;
              return (
                <li key={action.id}>
                  <Link
                    href={`/dossiers/${action.dossiers.id}#actions-correctives`}
                    className="block rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:border-primary-300 hover:bg-primary-50/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-secondary-900">{action.intitule}</p>
                        <p className="mt-1 font-mono text-caption text-muted-foreground">{action.dossiers.reference}</p>
                      </div>
                      <EtiquetteStatut ton={TONS[statut] ?? "neutre"}>
                        {LIBELLES_STATUT_ACTION[statut] ?? action.statut}
                      </EtiquetteStatut>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
                      <div><dt className="text-muted-foreground">Responsable</dt><dd className="mt-0.5 font-medium">{action.responsable_nom ?? action.users?.name ?? "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Échéance</dt><dd className="mt-0.5"><Echeance date={action.echeance} statut={statut} /></dd></div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Card className="hidden overflow-hidden p-0 md:flex">
            <Table>
              <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Dossier</TableHead><TableHead>Responsable</TableHead><TableHead>Échéance</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
              <TableBody>
                {resultat.actions.map((action) => {
                  const statut = action.statut as StatutAction;
                  return (
                    <TableRow key={action.id} className="relative cursor-pointer hover:bg-muted/50">
                      <TableCell className="max-w-xs">
                        <Link href={`/dossiers/${action.dossiers.id}#actions-correctives`} className="block truncate font-medium after:absolute after:inset-0 hover:underline" title={action.intitule}>{action.intitule}</Link>
                        <span className="text-caption text-muted-foreground">{action.dossiers.categories.libelle}</span>
                      </TableCell>
                      <TableCell><span className="font-mono text-caption">{action.dossiers.reference}</span><span className="block text-caption text-muted-foreground">{action.dossiers.parcours.libelle}</span></TableCell>
                      <TableCell className="text-sm">{action.responsable_nom ?? action.users?.name ?? "—"}</TableCell>
                      <TableCell><Echeance date={action.echeance} statut={statut} /></TableCell>
                      <TableCell><EtiquetteStatut ton={TONS[statut] ?? "neutre"}>{LIBELLES_STATUT_ACTION[statut] ?? action.statut}</EtiquetteStatut></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Pagination base="/actions-correctives" parametres={params} page={resultat.page} pages={resultat.pages} total={resultat.total} unite={resultat.total > 1 ? "actions" : "action"} />
    </div>
  );
}
