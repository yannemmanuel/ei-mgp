import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EtatVide } from "@/components/ui/etat-vide";
import {
  EtiquetteStatut,
  type TonStatut,
} from "@/components/ui/etiquette-statut";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarreFiltres,
  type ChampFiltre,
} from "@/components/layout/barre-filtres";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { Pagination } from "@/components/layout/pagination";
import { exigerUtilisateur } from "@/server/auth";
import { aPermission } from "@/server/authz";
import type { StatutAction } from "@/server/services/action-corrective/action-corrective";
import {
  joursAvantEcheance,
  LIBELLES_STATUT_ACTION,
  listerActions,
  referentielsActions,
} from "@/server/services/action-corrective/liste";

const dateFr = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(d);

const TONS: Record<StatutAction, TonStatut> = {
  non_demarree: "neutre",
  en_cours: "encours",
  realisee: "succes",
  en_retard: "alerte",
};

/**
 * Vue transverse des actions correctives
 *
 * L'écheance est la colonne qui commande : c'est un écran de travail, trié du plus urgent au plus
 * lointain. Le décompte de jours est calculé au rendu et non lu depuis `statut`, qui ne bascule
 * en « en retard » qu'au passage quotidien de la tâche planifiée.
 */
export async function VuePlanActions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const utilisateur = await exigerUtilisateur();

  if (!aPermission(utilisateur, 'plan_actions.view')) {
    redirect("/acces-refuse?droit=plan_actions.view");
  }

  const params = await searchParams;
  const lire = (cle: string) => {
    const v = params[cle];
    return typeof v === "string" && v !== "" ? v : undefined;
  };

  const filtres = {
    statut: lire("statut"),
    responsable: lire("responsable"),
    parcoursId: lire("parcoursId"),
    siteId: lire("siteId"),
    directionId: lire("directionId"),
    echeanceDebut: lire("echeanceDebut"),
    echeanceFin: lire("echeanceFin"),
  };

  const pageDemandee = Number(lire("page") ?? "1");
  const [resultat, referentiels] = await Promise.all([
    listerActions(
      utilisateur,
      filtres,
      Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1,
    ),
    referentielsActions(utilisateur),
  ]);

  const champs: ChampFiltre[] = [
    {
      type: "select",
      cle: "statut",
      libelle: "Statut",
      tous: "Tous",
      options: Object.entries(LIBELLES_STATUT_ACTION).map(
        ([valeur, libelle]) => ({
          valeur,
          libelle,
        }),
      ),
    },
    {
      type: "select",
      cle: "parcoursId",
      libelle: "Parcours",
      tous: "Tous",
      options: referentiels.parcours.map((p) => ({
        valeur: String(p.id),
        libelle: p.libelle,
      })),
    },
    {
      type: "select",
      cle: "responsable",
      libelle: "Responsable",
      tous: "Tous",
      // Les noms saisis sur les actions existantes : le responsable n'est plus un compte.
      options: referentiels.responsables.map((nom) => ({
        valeur: nom,
        libelle: nom,
      })),
    },
    {
      type: "select",
      cle: "siteId",
      libelle: "CSST",
      tous: "Tous",
      options: referentiels.sites.map((site) => ({
        valeur: String(site.id),
        libelle: site.libelle,
      })),
    },
    {
      type: "select",
      cle: "directionId",
      libelle: "Direction",
      tous: "Toutes",
      options: referentiels.directions.map((direction) => ({
        valeur: String(direction.id),
        libelle: direction.sites
          ? `${direction.libelle} — ${direction.sites.libelle}`
          : direction.libelle,
      })),
    },
    { type: "date", cle: "echeanceDebut", libelle: "Échéance à partir du" },
    { type: "date", cle: "echeanceFin", libelle: "Jusqu’au" },
  ];

  const filtree = champs.some((c) => filtres[c.cle as keyof typeof filtres]);

  return (
    <div className="space-y-5">
      <EnTetePage
        titre="Plan d’actions"
        lede="Vue d’ensemble des actions correctives par CSST et direction, classées par échéance."
        compteur={`${resultat.total} ${resultat.total > 1 ? "actions" : "action"}`}
      />

      {/*
        ⚠️ Plus de bascule « Les miennes » : le responsable est saisi à la main et n'est plus
        rattaché à un compte. Voir `FiltresActions` pour le détail.
      */}
      <BarreFiltres
        base="/plan-actions"
        champs={champs}
        valeurs={filtres}
      />

      {resultat.actions.length === 0 ? (
        <Card className="overflow-hidden p-0">
          <EtatVide
            icone={Wrench}
            titre={
              filtree
                ? "Aucune action ne correspond à ces critères."
                : "Aucune action corrective enregistrée."
            }
            description={
              filtree
                ? "Retirez un filtre pour élargir la recherche."
                : "Une action se crée depuis un dossier passé en action corrective."
            }
          />
        </Card>
      ) : (
        <>
          <ul
            className="space-y-3 md:hidden"
            aria-label="Liste des actions correctives"
          >
            {resultat.actions.map((action) => {
              const statut = action.statut as StatutAction;
              const restants = joursAvantEcheance(action.echeance);
              const aboutie = statut === "realisee";

              return (
                <li key={action.id}>
                  <Link
                    href={`/dossiers/${action.dossiers.id}#actions-correctives`}
                    className="block rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:border-primary-300 hover:bg-primary-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-secondary-900">
                          {action.intitule}
                        </p>
                        <p className="mt-1 font-mono text-caption text-muted-foreground">
                          {action.dossiers.reference}
                        </p>
                      </div>
                      <EtiquetteStatut ton={TONS[statut] ?? "neutre"}>
                        {LIBELLES_STATUT_ACTION[statut] ?? action.statut}
                      </EtiquetteStatut>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Déclarant</dt>
                        <dd className="mt-0.5 truncate font-medium text-secondary-800">
                          {action.declarant}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Responsable</dt>
                        <dd className="mt-0.5 truncate font-medium text-secondary-800">
                          {action.responsable_nom ?? action.users?.name ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Échéance</dt>
                        <dd className="mt-0.5 font-medium text-secondary-800">
                          {dateFr(action.echeance)}
                        </dd>
                        {!aboutie && (
                          <dd
                            className={
                              restants < 0
                                ? "mt-0.5 font-medium text-destructive"
                                : restants <= 3
                                  ? "mt-0.5 font-medium text-accent-700"
                                  : "mt-0.5 text-muted-foreground"
                            }
                          >
                            {restants < 0
                              ? `${Math.abs(restants)} j de retard`
                              : restants === 0
                                ? "Aujourd’hui"
                                : `dans ${restants} j`}
                          </dd>
                        )}
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">CSST / Direction</dt>
                        <dd className="mt-0.5 font-medium text-secondary-800">
                          {action.dossiers.sites?.libelle ?? "Sans CSST"} ·{" "}
                          {action.dossiers.directions?.libelle ?? "Sans direction"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Catégorie / famille de risque</dt>
                        <dd className="mt-0.5 font-medium text-secondary-800">
                          {action.dossiers.categories.libelle} ·{" "}
                          {action.dossiers.familles_risque?.libelle ?? "Non qualifiée"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Avancement</dt>
                        <dd className="mt-1 flex items-center gap-2">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary-100">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${action.avancement}%` }}
                            />
                          </span>
                          <span className="font-semibold text-secondary-800">
                            {action.avancement} %
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Card className="hidden overflow-hidden p-0 md:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-30 w-36 min-w-36 max-w-36 bg-secondary-50">
                    Référence
                  </TableHead>
                  <TableHead className="sticky left-36 z-30 w-44 min-w-44 max-w-44 border-r border-border bg-secondary-50 shadow-[6px_0_10px_-8px_rgba(18,33,59,0.45)]">
                    Déclarant
                  </TableHead>
                  <TableHead>CSST / Direction</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Famille de risque</TableHead>
                  <TableHead>Action corrective</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Délai</TableHead>
                  <TableHead>Avancement</TableHead>
                  <TableHead>Efficacité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultat.actions.map((action) => {
                  const statut = action.statut as StatutAction;
                  const restants = joursAvantEcheance(action.echeance);
                  const aboutie = statut === "realisee";

                  return (
                    <TableRow
                      key={action.id}
                      className="group relative cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="sticky left-0 z-20 w-36 min-w-36 max-w-36 bg-card transition-colors group-hover:bg-muted">
                        <Link
                          href={`/dossiers/${action.dossiers.id}#actions-correctives`}
                          className="font-mono text-caption font-semibold text-primary-700 underline-offset-2 after:absolute after:inset-0 hover:underline"
                        >
                          {action.dossiers.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="sticky left-36 z-20 w-44 min-w-44 max-w-44 whitespace-normal border-r border-border bg-card text-sm shadow-[6px_0_10px_-8px_rgba(18,33,59,0.45)] transition-colors group-hover:bg-muted">
                        <span className="line-clamp-3" title={action.declarant}>
                          {action.declarant}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal text-sm">
                        <span className="block font-medium">
                          {action.dossiers.sites?.libelle ?? "Sans CSST"}
                        </span>
                        <span className="block text-caption text-muted-foreground">
                          {action.dossiers.directions?.libelle ?? "Sans direction"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-48 whitespace-normal text-sm">
                        {action.dossiers.categories.libelle}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal text-sm">
                        <span className="line-clamp-3" title={action.dossiers.description}>
                          {action.dossiers.description}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-48 whitespace-normal text-sm">
                        {action.dossiers.familles_risque?.libelle ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal">
                        <span className="block font-medium text-secondary-900">
                          {action.intitule}
                        </span>
                        <span className="line-clamp-2 text-caption text-muted-foreground">
                          {action.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {action.responsable_nom ?? action.users?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {dateFr(action.echeance)}
                        {/* Le décompte n'a de sens que tant que l'action court : une action
                            réalisée dont l'échéance est passée n'est pas « en retard de 12 j ». */}
                        {!aboutie && (
                          <span
                            className={
                              restants < 0
                                ? "block text-caption font-medium text-destructive"
                                : restants <= 3
                                  ? "block text-caption font-medium text-accent-700"
                                  : "block text-caption text-muted-foreground"
                            }
                          >
                            {restants < 0
                              ? `${Math.abs(restants)} j de retard`
                              : restants === 0
                                ? "Aujourd’hui"
                                : `dans ${restants} j`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-28">
                          <div className="flex items-center justify-between gap-2 text-caption">
                            <span>{LIBELLES_STATUT_ACTION[statut] ?? action.statut}</span>
                            <strong>{action.avancement} %</strong>
                          </div>
                          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-secondary-100">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${action.avancement}%` }}
                            />
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {action.verification_efficacite === null ? (
                          <EtiquetteStatut ton="neutre">À évaluer</EtiquetteStatut>
                        ) : action.verification_efficacite ? (
                          <EtiquetteStatut ton="succes">Efficace</EtiquetteStatut>
                        ) : (
                          <EtiquetteStatut ton="alerte">Non efficace</EtiquetteStatut>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Pagination
        base="/plan-actions"
        parametres={params}
        page={resultat.page}
        pages={resultat.pages}
        total={resultat.total}
        unite={resultat.total > 1 ? "actions" : "action"}
      />
    </div>
  );
}
