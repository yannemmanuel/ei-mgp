"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  MapPin,
  Mail,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UsersRound,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BoutonSupprimer } from "../bouton-supprimer";
import { actionSupprimerCompte } from "../suppressions-actions";
import {
  actionEnregistrerCompte,
  actionRegenererMotDePasse,
  type EtatCompte,
} from "./actions";
import { useRetourEnToast } from "@/lib/retour-operation";

export type CompteVue = {
  id: string;
  name: string;
  email: string;
  matricule: string;
  poste: string;
  actif: boolean;
  directionId: string;
  siteId: string;
  roles: string[];
  /**
   * Ce que ce compte voit, en clair — les types de déclaration ouverts par ses RÔLES.
   *
   * ⚠️ NE SE MODIFIE PLUS ICI depuis le 2026-09-20 : l'habilitation se coche sur le rôle, dans
   * `/administration/habilitations`. Cette colonne reste en lecture, parce que c'est en regardant
   * un compte qu'on se demande ce qu'il voit — mais le geste, lui, a changé de place.
   */
  parcours: string[];
  tousLesParcours: boolean;
  /** Rattachement lisible, `null` s'il n'est pas renseigné. */
  site: string | null;
  direction: string | null;
  /**
   * Ce compte porte un rôle cloisonné par site sans en avoir un.
   *
   * Il voit alors TOUS les dossiers de son parcours, ce que le cloisonnement existe précisément
   * pour empêcher. Le signaler ici vaut mieux que de le découvrir en s'étonnant du nombre de
   * dossiers affichés.
   */
  siteManquant: boolean;
  /** Site du compte et site de sa direction se contredisent : l'un des deux est faux. */
  rattachementIncoherent: boolean;
};

type Option = { id: string; libelle: string };

/** Un rôle proposé à l'attribution : son identifiant technique, son nom lisible, son activation. */
export type RoleOption = {
  nom: string;
  libelle: string;
  actif: boolean;
  /**
   * Les parcours que ce rôle permet de confier.
   *
   * Porté par le rôle plutôt que par le compte parce que le formulaire en a besoin AVANT
   * l'enregistrement : cocher « Correspondant MGP » doit faire apparaître sur-le-champ les trois
   * types de grief qu'on peut alors lui confier. Un calcul côté serveur ne connaîtrait que les
   * rôles déjà enregistrés, et l'administrateur devrait enregistrer deux fois.
   */
  parcours: string[];
};

/** Un type de déclaration proposé à l'attribution. */
export type ParcoursOption = { code: string; libelle: string };

const ETAT: EtatCompte = {};
const champ =
  "mt-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none";

function initiales(nom: string): string {
  return nom
    .trim()
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((mot) => mot[0])
    .join("")
    .toUpperCase();
}

export function PanneauComptes({
  comptes,
  roles,
  parcours,
  directions,
  sites,
  recherche,
}: {
  comptes: CompteVue[];
  roles: RoleOption[];
  parcours: ParcoursOption[];
  directions: Option[];
  sites: Option[];
  recherche: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  // Les comptes portent des identifiants techniques ; le tableau affiche des noms.
  const libelleDuRole = new Map(roles.map((r) => [r.nom, r.libelle]));
  const [edition, setEdition] = useState<CompteVue | null>(null);
  const [creation, setCreation] = useState(false);
  const actifs = comptes.filter((compte) => compte.actif).length;
  const desactives = comptes.length - actifs;
  const alertes = comptes.filter(
    (compte) => compte.siteManquant || compte.rattachementIncoherent,
  ).length;

  function chercher(valeur: string) {
    const suivants = new URLSearchParams(params.toString());

    if (valeur === "") suivants.delete("q");
    else suivants.set("q", valeur);

    router.push(`/administration/utilisateurs?${suivants.toString()}`);
  }

  if (creation) {
    return (
      <div className="space-y-6">
        <EnTetePage
          titre="Créer un utilisateur"
          lede="Renseignez son identité, son rattachement puis les accès nécessaires à sa mission."
          mailles={[
            { libelle: "Administration", href: "/administration" },
            { libelle: "Utilisateurs", href: "/administration/utilisateurs" },
            { libelle: "Nouveau compte" },
          ]}
          actions={
            <Button
              variant="outline"
              onClick={() => setCreation(false)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Retour aux utilisateurs
            </Button>
          }
        />

        <ol
          className="grid gap-2 sm:grid-cols-3"
          aria-label="Étapes de création du compte"
        >
          {[
            ["1", "Informations", "Identité professionnelle"],
            ["2", "Organisation", "Site et responsable"],
            ["3", "Accès", "Rôles et visibilité"],
          ].map(([numero, titre, aide]) => (
            <li
              key={numero}
              className="flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50/55 px-4 py-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white">
                {numero}
              </span>
              <span>
                <span className="block text-xs font-semibold text-secondary-900">
                  {titre}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {aide}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mx-auto w-full max-w-5xl">
          <FormulaireCompte
            key="creation"
            compte={null}
            roles={roles}
            parcours={parcours}
            directions={directions}
            sites={sites}
            onFermer={() => setCreation(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Utilisateurs"
        lede="Gérez les accès, les rôles et le périmètre organisationnel des collaborateurs."
        mailles={[
          { libelle: "Administration", href: "/administration" },
          { libelle: "Comptes" },
        ]}
        actions={
          !creation && edition === null ? (
            <Button onClick={() => setCreation(true)} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Créer un utilisateur
            </Button>
          ) : null
        }
      />

      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Synthèse des utilisateurs"
      >
        <Indicateur
          icone={UsersRound}
          libelle="Affichés"
          valeur={comptes.length}
        />
        <Indicateur
          icone={UserCheck}
          libelle="Actifs"
          valeur={actifs}
          ton="succes"
        />
        <Indicateur icone={UserX} libelle="Désactivés" valeur={desactives} />
        <Indicateur
          icone={AlertTriangle}
          libelle="À vérifier"
          valeur={alertes}
          ton={alertes > 0 ? "alerte" : "neutre"}
        />
      </section>

      {(creation || edition !== null) && (
        /*
         * `key` : le formulaire est REMONTÉ dès qu'il change de compte.
         *
         * Ses champs sont non contrôlés — ils reçoivent `defaultValue`, que React ne lit qu'au
         * montage. Sans cette clé, cliquer « Modifier » sur une seconde ligne alors que le
         * formulaire est déjà ouvert le laissait en place : l'identifiant caché, lui contrôlé,
         * suivait la sélection, tandis que le nom et l'adresse restaient ceux du compte
         * précédent. Enregistrer écrivait alors les valeurs d'un compte SUR un autre. Base UI
         * signalait le symptôme en console ; le défaut, lui, était silencieux et destructeur.
         *
         * Remonter réinitialise aussi l'état de la Server Action — le mot de passe initial
         * affiché ne peut plus survivre à un changement de compte.
         */
        <FormulaireCompte
          key={edition?.id ?? "creation"}
          compte={edition}
          roles={roles}
          parcours={parcours}
          directions={directions}
          sites={sites}
          onFermer={() => {
            setCreation(false);
            setEdition(null);
          }}
        />
      )}

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-xl">
            <Label
              htmlFor="q"
              className="text-xs font-semibold text-secondary-700"
            >
              Rechercher un utilisateur
            </Label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                aria-hidden
              />
              <Input
                id="q"
                defaultValue={recherche}
                placeholder="Nom, adresse e-mail ou matricule…"
                className="h-10 pl-9 pr-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    chercher((e.target as HTMLInputElement).value.trim());
                }}
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => chercher("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-secondary-400 hover:bg-secondary-100 hover:text-secondary-700"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            <span className="font-semibold text-secondary-800">
              {comptes.length}
            </span>{" "}
            résultat{comptes.length > 1 ? "s" : ""}
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/70 bg-secondary-50/60 px-4 py-3 sm:px-5">
          <div>
            <h2 className="font-semibold text-secondary-900">
              Annuaire des utilisateurs
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sélectionnez un compte pour modifier ses accès.
            </p>
          </div>
        </div>
        <CardContent className="p-0">
          {comptes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Aucun compte ne correspond.
            </p>
          ) : (
            <>
              <ul
                className="divide-y divide-border md:hidden"
                aria-label="Liste des comptes"
              >
                {comptes.map((compte) => (
                  <li
                    key={compte.id}
                    className="space-y-4 p-4 transition-colors hover:bg-secondary-50/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-xs font-bold text-primary-800 ring-1 ring-primary-100">
                          {initiales(compte.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-secondary-900">
                            {compte.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {compte.email}
                          </p>
                        </div>
                      </div>
                      <Badge variant={compte.actif ? "default" : "secondary"}>
                        {compte.actif ? "Actif" : "Désactivé"}
                      </Badge>
                    </div>

                    <div>
                      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Rôles et périmètre
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {compte.roles.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            Aucun rôle
                          </span>
                        ) : (
                          compte.roles.map((role) => (
                            <Badge
                              key={role}
                              variant="secondary"
                              className="font-normal"
                            >
                              {libelleDuRole.get(role) ?? role}
                            </Badge>
                          ))
                        )}
                        {compte.siteManquant && (
                          <Badge variant="destructive" className="font-normal">
                            Site manquant
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 text-caption text-muted-foreground">
                        {compte.parcours.length === 0
                          ? "Ne voit aucun dossier"
                          : compte.tousLesParcours
                            ? "Tous les types de déclaration"
                            : compte.parcours.join(" · ")}
                      </p>
                    </div>

                    <div>
                      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Rattachement
                      </p>
                      <p className="mt-1 text-sm text-secondary-900">
                        {compte.site ?? "Aucun site"}
                        {compte.direction && (
                          <span className="block text-caption text-muted-foreground">
                            {compte.direction}
                          </span>
                        )}
                      </p>
                      {compte.rattachementIncoherent && (
                        <p className="mt-1 text-caption font-medium text-destructive">
                          Site et direction se contredisent
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCreation(false);
                          setEdition(compte);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                        Modifier
                      </Button>
                      <BoutonSupprimer
                        id={compte.id}
                        nom={compte.name}
                        action={actionSupprimerCompte}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[32%]" />
                    <col className="w-[22%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead className="bg-secondary-50/70">
                    <tr className="border-b border-border text-left">
                      <th
                        scope="col"
                        className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-secondary-500"
                      >
                        Utilisateur
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-secondary-500"
                      >
                        Rôles et accès
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-secondary-500"
                      >
                        Rattachement
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-secondary-500"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comptes.map((compte) => (
                      <tr
                        key={compte.id}
                        className="border-b border-border/50 transition-colors hover:bg-primary-50/35"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-[11px] font-bold text-primary-800 ring-1 ring-primary-100">
                              {initiales(compte.name)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-semibold text-secondary-900">
                                  {compte.name}
                                </p>
                                <Badge
                                  variant={
                                    compte.actif ? "default" : "secondary"
                                  }
                                  className="shrink-0 text-[10px]"
                                >
                                  {compte.actif ? "Actif" : "Désactivé"}
                                </Badge>
                              </div>
                              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" aria-hidden />
                                {compte.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {compte.roles.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              compte.roles.map((role) => (
                                <Badge
                                  key={role}
                                  variant="secondary"
                                  className="font-normal"
                                >
                                  {libelleDuRole.get(role) ?? role}
                                </Badge>
                              ))
                            )}
                            {compte.siteManquant && (
                              <Badge
                                variant="destructive"
                                className="font-normal"
                                title="Ce rôle est habilité par site, mais aucun site n’est renseigné : le compte voit tous les dossiers de son parcours."
                              >
                                Site manquant
                              </Badge>
                            )}
                          </div>

                          {/*
                          CE QUE LA PERSONNE VOIT, et non plus seulement les rôles qu'elle porte.

                          C'est la question qu'on se pose devant un compte, et la réponse ne se lit
                          pas dans la liste des rôles : elle dépend de ce qui a été coché sur
                          chacun d'eux. Cette ligne est le seul endroit qui la rend lisible sans
                          ouvrir l'écran des habilitations.

                          « Ne voit aucun dossier » n'est pas toujours une erreur — c'est l'état
                          normal d'un compte d'administration ou de saisie relais. Mais sur un
                          compte censé traiter des déclarations, c'est la cause qu'on cherchera en
                          s'étonnant d'un écran vide, et elle se règle sur le rôle.
                        */}
                          <p className="mt-1 text-caption text-muted-foreground">
                            {compte.parcours.length === 0
                              ? "Ne voit aucun dossier"
                              : compte.tousLesParcours
                                ? "Tous les types de déclaration"
                                : compte.parcours.join(" · ")}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          {compte.site === null && compte.direction === null ? (
                            <span className="text-xs text-muted-foreground">
                              Non renseigné
                            </span>
                          ) : (
                            <div className="text-sm">
                              <span className="text-secondary-900">
                                {compte.site ?? "Aucun site"}
                              </span>
                              {compte.direction && (
                                <span className="block text-caption text-muted-foreground">
                                  {compte.direction}
                                </span>
                              )}
                              {compte.rattachementIncoherent && (
                                <span
                                  className="mt-0.5 block text-caption font-medium text-destructive"
                                  title="La direction de ce compte relève d’un autre site que celui qui lui est attribué."
                                >
                                  Site et direction se contredisent
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex flex-col items-end gap-2 xl:flex-row xl:items-start xl:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setCreation(false);
                                setEdition(compte);
                              }}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                              Modifier
                            </Button>

                            {/*
                            ⚠️ Refusé dès que le compte a laissé une trace — une connexion suffit,
                            elle est journalisée. Le cas visé est le compte créé par erreur : une
                            adresse mal saisie, un doublon, un essai.

                            Pour tous les autres, la désactivation coupe l'accès immédiatement tout
                            en gardant le compte nommé dans l'audit. Sur un dispositif de
                            signalement, pouvoir dire qui a traité quel dossier n'est pas une
                            commodité : c'est ce qui le rend vérifiable.
                          */}
                            <BoutonSupprimer
                              id={compte.id}
                              nom={compte.name}
                              action={actionSupprimerCompte}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Indicateur({
  icone: Icone,
  libelle,
  valeur,
  ton = "neutre",
}: {
  icone: LucideIcon;
  libelle: string;
  valeur: number;
  ton?: "neutre" | "succes" | "alerte";
}) {
  const styles =
    ton === "succes"
      ? "bg-primary-50 text-primary-700 ring-primary-100"
      : ton === "alerte"
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : "bg-secondary-50 text-secondary-600 ring-secondary-100";

  return (
    <Card className="gap-0 p-3.5 sm:p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${styles}`}
        >
          <Icone className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-xl font-bold tabular-nums text-secondary-900">
            {valeur}
          </p>
          <p className="text-[11px] font-medium text-muted-foreground">
            {libelle}
          </p>
        </div>
      </div>
    </Card>
  );
}

function FormulaireCompte({
  compte,
  roles,
  parcours,
  directions,
  sites,
  onFermer,
}: {
  compte: CompteVue | null;
  roles: RoleOption[];
  parcours: ParcoursOption[];
  directions: Option[];
  sites: Option[];
  onFermer: () => void;
}) {
  const [etat, envoyer, enCours] = useActionState(
    actionEnregistrerCompte,
    ETAT,
  );
  useRetourEnToast(etat);
  const router = useRouter();
  const etatTraite = useRef<EtatCompte | null>(null);

  useEffect(() => {
    if (!etat.succes || etatTraite.current === etat) return;
    etatTraite.current = etat;

    router.refresh();

    // Un secret affiché une seule fois doit rester à l'écran jusqu'à ce que l'administrateur
    // l'ait copié. Dans les autres cas, revenir à la liste montre immédiatement le résultat.
    if (!etat.motDePasseInitial) onFermer();
  }, [etat, onFermer, router]);

  /*
    Rattachement contrôlé : direction OU site, l'un excluant l'autre à l'écran.

    ⚠️ Un compte existant peut porter LES DEUX — la règle est nouvelle, la donnée ne l'est pas.
    La DIRECTION l'emporte alors à l'ouverture : c'est le rattachement le plus précis, et il
    porte déjà son site. Le site est donc vidé à l'affichage, et l'enregistrement le confirmera
    — rien n'est écrasé tant qu'on n'enregistre pas.
  */
  const [directionId, setDirectionId] = useState(compte?.directionId ?? "");
  const [siteId, setSiteId] = useState(
    compte?.directionId ? "" : (compte?.siteId ?? ""),
  );
  const rattachementAffiche = directionId
    ? `Direction : ${directions.find((d) => d.id === directionId)?.libelle ?? "inconnue"}`
    : siteId
      ? `Site : ${sites.find((s) => s.id === siteId)?.libelle ?? "inconnu"}`
      : "Aucun rattachement sélectionné";

  /*
    Les rôles cochés, suivis en état — le seul champ du formulaire qui le soit.

    Tous les autres sont non contrôlés (`defaultValue`), et c'est très bien : personne n'a besoin
    de savoir ce qu'on tape dans « Nom » avant l'envoi. Les rôles, si — ils commandent la liste des
    parcours attribuables juste en dessous. Cocher « Correspondant MGP » doit faire apparaître les
    trois types de grief tout de suite, sans passer par un enregistrement intermédiaire.
  */
  const [rolesCoches, setRolesCoches] = useState<Set<string>>(
    new Set(compte?.roles ?? []),
  );

  const parcoursParRole = new Map(roles.map((r) => [r.nom, r.parcours]));
  const attribuables = new Set<string>();
  for (const role of rolesCoches) {
    for (const code of parcoursParRole.get(role) ?? []) attribuables.add(code);
  }

  const proposes = parcours.filter((p) => attribuables.has(p.code));

  return (
    <Card className="border-primary-200 shadow-lg shadow-secondary-900/5">
      <CardHeader className="border-b border-primary-100 bg-gradient-to-r from-primary-50 to-white py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-700 shadow-xs ring-1 ring-primary-100">
              {compte ? (
                <Pencil className="h-5 w-5" aria-hidden />
              ) : (
                <Plus className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div>
              <CardTitle className="text-h3">
                {compte ? `Modifier ${compte.name}` : "Créer un utilisateur"}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Identité, rattachement et droits d’accès
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onFermer}
            aria-label="Fermer le formulaire"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {/*
          Ce que l'administrateur doit savoir après une création, selon la voie empruntée.

          PAR LIEN : il n'y a aucun secret à lui montrer, et c'est l'intérêt du procédé — il ne
          peut pas divulguer ce qu'il ne connaît pas. Reste à lui dire que le message est parti,
          et quoi faire s'il ne l'est pas.

          PAR MOT DE PASSE : la valeur est la seule porte du compte, elle ne s'affiche qu'une
          fois, et l'écran doit dire clairement qu'aucun courriel n'est parti.
        */}
        {etat.parInvitation && (
          <Alert
            className="mb-4"
            variant={etat.courriel === "echec" ? "destructive" : undefined}
          >
            <AlertDescription>
              {etat.courriel === "expedie" ? (
                <>
                  <p className="font-medium">
                    Un lien de première connexion a été envoyé.
                  </p>
                  <p className="mt-1 text-caption">
                    La personne choisira son mot de passe. Le lien vaut 72
                    heures, une seule fois.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">L’envoi du lien a échoué.</p>
                  <p className="mt-1 text-caption">
                    Le compte est créé et le mot de passe ci-dessous lui a été
                    attribué : transmettez-le par un canal sûr. Diagnostic :{" "}
                    <code>npm run tester-email</code>.
                  </p>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {etat.motDePasseInitial && (
          <Alert className="mb-4">
            <AlertDescription>
              <p className="font-medium">Mot de passe initial : </p>
              <p className="mt-1 font-mono text-base">
                {etat.motDePasseInitial}
              </p>

              {/*
                Le motif est dit UNE fois, et au bon endroit.

                Sur échec d'envoi, la bannière au-dessus l'explique déjà : répéter ici « aucun
                e-mail n'a été envoyé » ferait lire deux diagnostics différents pour un seul
                incident. Le message ci-dessous ne vaut donc que pour l'absence de messagerie.
              */}
              {etat.courriel === "echec" ? (
                <p className="mt-2 text-caption">
                  À remettre en main propre. La personne le changera à sa
                  première connexion.
                </p>
              ) : (
                <p className="mt-2 text-caption text-amber-700">
                  <span className="font-medium">
                    Aucun e-mail n’a été envoyé.
                  </span>{" "}
                  La messagerie n’est pas configurée (<code>MAIL_HOST</code>,{" "}
                  <code>MAIL_FROM</code>). Transmettez ce mot de passe par un
                  canal sûr.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <form action={envoyer} className="space-y-6">
          <input type="hidden" name="id" value={compte?.id ?? ""} />

          <section className="rounded-xl border border-border/70 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary-700" aria-hidden />
              <h3 className="text-sm font-semibold text-secondary-900">
                Identité et rattachement
              </h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="name"
                  className="text-caption text-muted-foreground"
                >
                  Nom *
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  defaultValue={compte?.name ?? ""}
                  className="mt-1"
                />
                {!compte && (
                  <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                    L’invitation de première connexion sera envoyée à cette
                    adresse si la messagerie est configurée.
                  </p>
                )}
              </div>

              <div>
                <Label
                  htmlFor="email"
                  className="text-caption text-muted-foreground"
                >
                  Adresse e-mail *
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  defaultValue={compte?.email ?? ""}
                  className="mt-1"
                />
              </div>

              <div>
                <Label
                  htmlFor="matricule"
                  className="text-caption text-muted-foreground"
                >
                  Matricule
                </Label>
                <Input
                  id="matricule"
                  name="matricule"
                  defaultValue={compte?.matricule ?? ""}
                  className="mt-1"
                />
              </div>

              <div>
                <Label
                  htmlFor="poste"
                  className="text-caption text-muted-foreground"
                >
                  Poste
                </Label>
                <Input
                  id="poste"
                  name="poste"
                  defaultValue={compte?.poste ?? ""}
                  className="mt-1"
                />
              </div>

              {/*
              RATTACHEMENT : une direction OU un site, jamais les deux.

              C'est lui qui décide ce que le compte reçoit — les affectations suivent désormais le
              parcours et le rattachement, sans geste manuel. Deux valeurs concurrentes rendraient
              cette règle indécidable : à quel périmètre appartient quelqu'un rattaché à la
              direction A et au site B, quand A ne relève pas de B ?

              ⚠️ La direction est le rattachement le PLUS PRÉCIS : elle porte déjà son site
              (`directions.site_id`), et `chargerUtilisateurAutorise()` l'en déduit. Choisir une
              direction ne perd donc aucun cloisonnement — il le resserre.
            */}
              <div>
                <Label
                  htmlFor="directionId"
                  className="text-caption text-muted-foreground"
                >
                  Direction
                </Label>
                <select
                  id="directionId"
                  name="directionId"
                  value={directionId}
                  onChange={(e) => {
                    setDirectionId(e.target.value);
                    if (e.target.value !== "") setSiteId("");
                  }}
                  disabled={siteId !== ""}
                  className={`${champ} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <option value="">—</option>
                  {directions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.libelle}
                    </option>
                  ))}
                </select>
                {siteId !== "" && (
                  <p className="mt-1 text-caption text-muted-foreground">
                    Un site est déjà choisi. Videz-le pour rattacher à une
                    direction.
                  </p>
                )}
              </div>

              <div>
                <Label
                  htmlFor="siteId"
                  className="text-caption text-muted-foreground"
                >
                  Site
                </Label>
                <select
                  id="siteId"
                  name="siteId"
                  value={siteId}
                  onChange={(e) => {
                    setSiteId(e.target.value);
                    if (e.target.value !== "") setDirectionId("");
                  }}
                  disabled={directionId !== ""}
                  className={`${champ} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <option value="">—</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
                {directionId !== "" && (
                  <p className="mt-1 text-caption text-muted-foreground">
                    Déduit de la direction choisie — inutile de le renseigner.
                  </p>
                )}
              </div>

            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs font-medium text-primary-900">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span>Périmètre d’habilitation : {rattachementAffiche}</span>
            </div>
          </section>

          <fieldset className="rounded-xl border border-border/70 p-4 sm:p-5">
            <legend className="px-2 text-sm font-semibold text-secondary-900">
              Rôles attribués
            </legend>
            <p className="mb-3 text-xs text-muted-foreground">
              Les rôles déterminent les actions autorisées et les types de
              déclaration visibles.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => {
                const detenu = compte?.roles.includes(role.nom) ?? false;

                // Un rôle désactivé reste affiché s'il est déjà porté : le décocher doit être une
                // décision, pas la conséquence d'un enregistrement où l'on venait corriger un
                // numéro de téléphone.
                if (!role.actif && !detenu) return null;

                return (
                  <label
                    key={role.nom}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-sm transition-colors hover:bg-secondary-50 has-[:checked]:border-primary-200 has-[:checked]:bg-primary-50/60"
                  >
                    <input
                      type="checkbox"
                      name="roles"
                      value={role.nom}
                      defaultChecked={detenu}
                      onChange={(e) =>
                        setRolesCoches((avant) => {
                          const apres = new Set(avant);
                          if (e.target.checked) apres.add(role.nom);
                          else apres.delete(role.nom);
                          return apres;
                        })
                      }
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-secondary-900">
                        {role.libelle}
                        {!role.actif && (
                          <span className="ml-1.5 text-caption text-destructive">
                            désactivé
                          </span>
                        )}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {role.nom}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/*
            ⚠️ LES CASES « TYPES DE DÉCLARATION CONFIÉS » ONT ÉTÉ RETIRÉES D'ICI.

            L'habilitation se coche désormais sur le RÔLE, dans l'écran des habilitations
            (décision métier du 2026-09-20) : tous les porteurs d'un rôle voient les mêmes types.
            Laisser les cases en place aurait fait croire à un réglage par personne qui n'a plus
            aucun effet — le pire des deux, une commande qui ne commande rien.

            Ce qui reste ici est la CONSÉQUENCE, en lecture : ce que ce compte verra, d'après les
            rôles cochés juste au-dessus. On la lit au moment où l'on coche, sans avoir à ouvrir
            un second écran pour deviner le résultat.
          */}
          <fieldset className="rounded-xl border border-secondary-100 bg-secondary-50/55 p-4 sm:p-5">
            <legend className="px-2 text-sm font-semibold text-secondary-900">
              Ce que ce compte verra
            </legend>

            {proposes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {rolesCoches.size === 0
                  ? "Cochez un rôle : les types de déclaration qu’il ouvre apparaîtront ici."
                  : "Aucun des rôles cochés n’ouvre de type de déclaration. Ce compte ne verra aucun dossier."}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {proposes.map((p) => (
                  <Badge
                    key={p.code}
                    variant="secondary"
                    className="font-normal"
                  >
                    {p.libelle}
                  </Badge>
                ))}
              </div>
            )}

            <p className="mt-2 text-caption text-muted-foreground">
              Pour changer les types qu’un rôle ouvre, allez dans les{" "}
              <Link
                href="/administration/habilitations"
                className="text-primary-700 underline underline-offset-2"
              >
                habilitations
              </Link>
              . Le changement vaut pour tous les porteurs de ce rôle.
            </p>
          </fieldset>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/70 p-4 text-sm transition-colors hover:bg-secondary-50">
            <span>
              <span className="block font-semibold text-secondary-900">
                Compte actif
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Un compte désactivé ne peut plus se connecter immédiatement.
              </span>
            </span>
            <input
              type="checkbox"
              name="actif"
              value="1"
              defaultChecked={compte?.actif ?? true}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onFermer}>
              Annuler
            </Button>
            <Button type="submit" disabled={enCours}>
              {enCours
                ? compte
                  ? "Enregistrement…"
                  : "Création du compte…"
                : compte
                  ? "Enregistrer les modifications"
                  : "Créer le compte"}
            </Button>
          </div>
        </form>

        {compte && <RegenerationMotDePasse compte={compte} />}
      </CardContent>
    </Card>
  );
}

/**
 * Deux voies de récupération : le lien sécurisé permet au titulaire de choisir lui-même son mot
 * de passe ; la génération manuelle reste disponible si la messagerie est indisponible.
 */
function RegenerationMotDePasse({ compte }: { compte: CompteVue }) {
  const [etat, envoyer, enCours] = useActionState(
    actionRegenererMotDePasse,
    ETAT,
  );
  useRetourEnToast(etat);

  return (
    <form
      action={envoyer}
      className="mt-6 space-y-2 border-t border-border pt-4"
    >
      <input type="hidden" name="id" value={compte.id} />

      <p className="text-caption text-muted-foreground">
        Si {compte.name} a perdu son mot de passe, envoyez-lui de préférence un lien personnel.
        Aucun mot de passe ne sera transmis par e-mail.
      </p>

      {etat.motDePasseInitial && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">Nouveau mot de passe : </p>
            <p className="mt-1 font-mono text-base">{etat.motDePasseInitial}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="remise"
          value="courriel"
          size="sm"
          disabled={enCours}
        >
          <Mail aria-hidden />
          {enCours ? "Traitement…" : "Envoyer un lien sécurisé"}
        </Button>
        <Button
          type="submit"
          name="remise"
          value="manuelle"
          size="sm"
          variant="outline"
          disabled={enCours}
        >
          {enCours ? "Traitement…" : "Générer un mot de passe provisoire"}
        </Button>
      </div>
    </form>
  );
}
