"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EnTetePage } from "@/components/layout/en-tete-page";
import { useRetourEnToast } from "@/lib/retour-operation";

/**
 * Éditeur commun aux référentiels d'administration.
 *
 * Cinq écrans (catégories, statuts, sites, canaux, gabarits) ont exactement la même forme :
 * une table et un formulaire. Les écrire cinq fois multiplierait les endroits où une règle peut
 * diverger — notamment la protection de l'historique, qui n'est pas une commodité mais une
 * contrainte d'intégrité (RG-03) : le rang et la suppression ne sont rendus que si l'écran les
 * fournit, et la suppression reste refusée par le SERVICE dès qu'une ligne est citée.
 *
 * ⚠️ Ce composant ne décide RIEN : il rend ce qu'on lui donne et poste à l'action serveur, qui
 * revérifie la permission. `creationPossible` ne masque qu'un bouton.
 */
export type ChampReferentiel =
  | {
      type: "texte";
      nom: string;
      libelle: string;
      requis?: boolean;
      max?: number;
    }
  | {
      type: "zone";
      nom: string;
      libelle: string;
      requis?: boolean;
      max?: number;
      aide?: string;
    }
  | {
      type: "nombre";
      nom: string;
      libelle: string;
      requis?: boolean;
      min?: number;
    }
  | { type: "booleen"; nom: string; libelle: string }
  | {
      type: "liste";
      nom: string;
      libelle: string;
      options: { valeur: string; libelle: string }[];
      requis?: boolean;
      vide?: string;
    };

export type ValeursLigne = Record<string, string | boolean>;

export type LigneReferentiel = {
  id: string;
  cellules: (
    | string
    | { badge: string; variant?: "default" | "secondary" | "destructive" }
  )[];
  valeurs: ValeursLigne;
  /**
   * Groupe auquel la ligne appartient — le parcours d'une catégorie, la direction d'un poste.
   *
   * Sert au seul calcul des extrémités : monter la première ligne d'un parcours ne doit pas la
   * faire passer dans le parcours précédent. Absent, tout le tableau ne forme qu'un groupe.
   */
  groupe?: string;
};

export type EtatFormulaire = { erreur?: string; succes?: string };

type ActionReferentiel = (
  etat: EtatFormulaire,
  donnees: FormData,
) => Promise<EtatFormulaire>;

type Props = {
  titre: string;
  description?: string;
  colonnes: string[];
  lignes: LigneReferentiel[];
  champs: ChampReferentiel[];
  action: ActionReferentiel;
  /** Faux pour un référentiel dont les lignes sont fixées (statuts, canaux). */
  creationPossible: boolean;
  libelleCreation?: string;
  messageVide?: string;
  /**
   * Déplacement d'une ligne d'un rang. Absente, aucun bouton de rang n'est rendu.
   *
   * Le rang ne s'écrit plus à la main depuis le 11/09/2026 : tant que les lignes d'un groupe le
   * partagent, l'affichage est alphabétique. Ces boutons servent aux listes où l'ordre porte un
   * sens que l'alphabet ignore — une échelle d'ancienneté, par exemple.
   */
  actionDeplacer?: ActionReferentiel;
  /**
   * Suppression d'une ligne. Absente, aucun bouton de suppression n'est rendu.
   *
   * ⚠️ Ce n'est pas parce que le bouton est là que la ligne partira : le service compte d'abord
   * ce qui la cite et refuse tant que ce compte n'est pas nul (RG-03). Le refus revient dans
   * `erreur`, avec son motif.
   */
  actionSupprimer?: ActionReferentiel;
  /** Affiche un titre de section léger quand plusieurs éditeurs partagent la même page. */
  presentation?: "page" | "section";
  /** Nombre de lignes affichées à la fois. Sans valeur, aucune pagination n'est appliquée. */
  taillePage?: number;
  /** Libellé du filtre proposé lorsque les lignes sont réparties en groupes. */
  libelleTousGroupes?: string;
};

const ETAT: EtatFormulaire = {};
const champCss =
  "mt-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none";

/** Action neutre : `useActionState` ne peut pas être appelé conditionnellement. */
const INERTE: ActionReferentiel = async (etat) => etat;

export function EditeurReferentiel({
  titre,
  description,
  colonnes,
  lignes,
  champs,
  action,
  creationPossible,
  libelleCreation = "Ajouter",
  messageVide = "Aucune entrée.",
  actionDeplacer,
  actionSupprimer,
  presentation = "page",
  taillePage = 24,
  libelleTousGroupes = "Tous les groupes",
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT);
  const [etatRang, envoyerRang, rangEnCours] = useActionState(
    actionDeplacer ?? INERTE,
    ETAT,
  );
  const [etatSuppression, envoyerSuppression, suppressionEnCours] =
    useActionState(actionSupprimer ?? INERTE, ETAT);
  const [edition, setEdition] = useState<{
    id: string;
    valeurs: ValeursLigne;
  } | null>(null);
  /** Ligne dont la suppression attend confirmation — un clic ne suffit pas à effacer. */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [groupeActif, setGroupeActif] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();

  const valeursVides: ValeursLigne = Object.fromEntries(
    champs.map((c) => [c.nom, c.type === "booleen" ? true : ""]),
  );

  // Les trois retours partent en notification. Ils n'ont plus de place réservée dans la page :
  // l'encart de succès poussait le tableau vers le bas à chaque enregistrement.
  useRetourEnToast(etat);
  useRetourEnToast(etatRang);
  useRetourEnToast(etatSuppression);

  useEffect(() => {
    if (etat.succes || etatRang.succes || etatSuppression.succes)
      router.refresh();
  }, [etat, etatRang, etatSuppression, router]);

  const groupes = useMemo(() => {
    const trouves = new Map<string, string>();
    for (const ligne of lignes) {
      if (!ligne.groupe || trouves.has(ligne.groupe)) continue;
      const premierTexte = ligne.cellules.find((cellule) => typeof cellule === "string");
      trouves.set(ligne.groupe, typeof premierTexte === "string" ? premierTexte : ligne.groupe);
    }
    return [...trouves].map(([valeur, libelle]) => ({ valeur, libelle }));
  }, [lignes]);

  const lignesFiltrees = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr");
    return lignes.filter((ligne) => {
      if (groupeActif && ligne.groupe !== groupeActif) return false;
      if (!terme) return true;
      return ligne.cellules.some((cellule) =>
        (typeof cellule === "string" ? cellule : cellule.badge)
          .toLocaleLowerCase("fr")
          .includes(terme),
      );
    });
  }, [groupeActif, lignes, recherche]);

  const nombrePages = taillePage
    ? Math.max(1, Math.ceil(lignesFiltrees.length / taillePage))
    : 1;
  const pageCourante = Math.min(page, nombrePages);
  const lignesAffichees = taillePage
    ? lignesFiltrees.slice((pageCourante - 1) * taillePage, pageCourante * taillePage)
    : lignesFiltrees;

  const actionCreation =
    creationPossible && edition === null ? (
      <Button
        onClick={() => setEdition({ id: "", valeurs: valeursVides })}
        className="gap-2"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {libelleCreation}
      </Button>
    ) : null;

  return (
    <div className="space-y-6">
      {presentation === "page" ? (
        <EnTetePage
          titre={titre}
          lede={description}
          mailles={[
            { libelle: "Administration", href: "/administration" },
            { libelle: titre },
          ]}
          actions={actionCreation}
        />
      ) : (
        <div className="flex flex-col gap-4 border-t border-border pt-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-secondary-950">{titre}</h2>
            {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="shrink-0">{actionCreation}</div>
        </div>
      )}

      {edition !== null && (
        <Card className="border-primary-200 shadow-lg shadow-secondary-900/5">
          <CardHeader className="border-b border-primary-100 bg-gradient-to-r from-primary-50 to-white py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-primary-100">
                  {edition.id === "" ? (
                    <Plus className="h-4 w-4" aria-hidden />
                  ) : (
                    <Pencil className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div>
                  <CardTitle className="text-h3">
                    {edition.id === ""
                      ? libelleCreation
                      : "Modifier une entrée"}
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Les modifications sont appliquées immédiatement aux écrans
                    concernés.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEdition(null)}
                aria-label="Fermer le formulaire"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form action={envoyer} className="space-y-4">
              <input type="hidden" name="id" value={edition.id} />

              {/*
                ⚠️ LA CLÉ PORTE L'IDENTIFIANT DE LA LIGNE, et ce n'était pas le cas.

                Les champs sont NON CONTRÔLÉS, amorcés par `defaultValue`. React ignore un
                `defaultValue` qui change sur un champ déjà monté : le DOM garde l'ancienne
                valeur. Or « Modifier » est offert sur chaque ligne, y compris pendant qu'on en
                édite une autre.

                Avec `key={champ.nom}` seul, l'enchaînement « Modifier A » puis « Modifier B »
                laissait les champs sur les valeurs de A tandis que l'identifiant caché — lui,
                contrôlé — passait à B. Enregistrer écrasait alors la ligne B avec le libellé de
                la ligne A. Aucune erreur, aucun refus : le mauvais enregistrement aboutissait.
                Base UI le signalait en console (« changing the default value state of an
                uncontrolled FieldControl »), mais le symptôme réel était une perte de données.

                ⚠️ L'IDENTIFIANT SEULEMENT, jamais les valeurs : la clé ne doit changer QUE
                lorsqu'on change de ligne. L'y faire entrer les valeurs remonterait les champs à
                chaque frappe, et la saisie disparaîtrait lettre à lettre.
              */}
              <div className="grid gap-4 sm:grid-cols-2">
                {champs.map((champ) => (
                  <Champ
                    key={`${edition.id}-${champ.nom}`}
                    champ={champ}
                    valeur={edition.valeurs[champ.nom]}
                  />
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEdition(null)}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={enCours}>
                  {enCours ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/70 bg-secondary-50/60 px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold text-secondary-900">
              Liste des entrées
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lignesFiltrees.length === lignes.length
                ? `${lignes.length} entrée${lignes.length > 1 ? "s" : ""} configurée${lignes.length > 1 ? "s" : ""}`
                : `${lignesFiltrees.length} résultat${lignesFiltrees.length > 1 ? "s" : ""} sur ${lignes.length}`}
            </p>
          </div>
          {lignes.length > 8 && (
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <label className="relative min-w-0 flex-1 lg:w-64">
                <span className="sr-only">Rechercher dans {titre.toLocaleLowerCase("fr")}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={recherche}
                  onChange={(event) => {
                    setRecherche(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Rechercher…"
                  className="bg-background pl-9"
                />
              </label>
              {groupes.length > 1 && (
                <select
                  value={groupeActif}
                  onChange={(event) => {
                    setGroupeActif(event.target.value);
                    setPage(1);
                  }}
                  aria-label={`Filtrer ${titre.toLocaleLowerCase("fr")}`}
                  className="min-h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm sm:max-w-64"
                >
                  <option value="">{libelleTousGroupes}</option>
                  {groupes.map((groupe) => (
                    <option key={groupe.valeur} value={groupe.valeur}>{groupe.libelle}</option>
                  ))}
                </select>
              )}
              {(recherche || groupeActif) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setRecherche(""); setGroupeActif(""); setPage(1); }}>
                  <X className="h-4 w-4" aria-hidden />
                  Réinitialiser
                </Button>
              )}
            </div>
          )}
        </div>
        <CardContent className="p-0">
          {lignesFiltrees.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {lignes.length === 0 ? messageVide : "Aucune entrée ne correspond à votre recherche."}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden" aria-label="Liste des entrées">
                {lignesAffichees.map((ligne, index) => {
                  const groupe = ligne.groupe ?? "";
                  const memeGroupe = lignes.filter((l) => (l.groupe ?? "") === groupe);
                  const rang = memeGroupe.indexOf(ligne);
                  const nom =
                    ligne.cellules.find((c) => typeof c === "string") ?? `ligne ${index + 1}`;

                  return (
                    <li key={ligne.id} className="space-y-4 p-4">
                      <dl className="space-y-2.5">
                        {ligne.cellules.map((cellule, colonne) => (
                          <div key={colonnes[colonne] ?? colonne} className="grid grid-cols-[minmax(6rem,40%)_1fr] gap-3">
                            <dt className="text-xs font-semibold text-muted-foreground">
                              {colonnes[colonne] ?? `Champ ${colonne + 1}`}
                            </dt>
                            <dd className="min-w-0 break-words text-sm text-secondary-900">
                              {typeof cellule === "string" ? (
                                cellule
                              ) : (
                                <Badge variant={cellule.variant ?? "secondary"}>{cellule.badge}</Badge>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                        {actionDeplacer && (
                          <>
                            <BoutonRang
                              envoyer={envoyerRang}
                              id={ligne.id}
                              sens="monter"
                              nom={String(nom)}
                              inactif={rang === 0 || rangEnCours}
                            />
                            <BoutonRang
                              envoyer={envoyerRang}
                              id={ligne.id}
                              sens="descendre"
                              nom={String(nom)}
                              inactif={rang === memeGroupe.length - 1 || rangEnCours}
                            />
                          </>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setEdition({ id: ligne.id, valeurs: ligne.valeurs })}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Modifier
                        </Button>

                        {actionSupprimer &&
                          (aConfirmer === ligne.id ? (
                            <form action={envoyerSuppression} className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-destructive/5 p-2">
                              <input type="hidden" name="id" value={ligne.id} />
                              <span className="w-full text-caption text-muted-foreground">Confirmer la suppression ?</span>
                              <Button type="submit" size="sm" variant="destructive" className="flex-1" disabled={suppressionEnCours}>
                                {suppressionEnCours ? "Suppression…" : "Oui, supprimer"}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="flex-1" onClick={() => setAConfirmer(null)}>
                                Annuler
                              </Button>
                            </form>
                          ) : (
                            <Button size="sm" variant="ghost" className="flex-1 text-destructive hover:bg-destructive/10" onClick={() => setAConfirmer(ligne.id)}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Supprimer
                            </Button>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary-50/70">
                  <tr className="border-b border-border text-left">
                    {colonnes.map((colonne) => (
                      <th
                        key={colonne}
                        className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-secondary-500"
                      >
                        {colonne}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-secondary-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignesAffichees.map((ligne, index) => {
                    const groupe = ligne.groupe ?? "";
                    const memeGroupe = lignes.filter(
                      (l) => (l.groupe ?? "") === groupe,
                    );
                    const rang = memeGroupe.indexOf(ligne);
                    const nom =
                      ligne.cellules.find((c) => typeof c === "string") ??
                      `ligne ${index + 1}`;

                    return (
                      <tr
                        key={ligne.id}
                        className="border-b border-border/50 transition-colors hover:bg-primary-50/35"
                      >
                        {ligne.cellules.map((cellule, colonne) => (
                          <td
                            key={colonnes[colonne] ?? colonne}
                            className="px-4 py-3.5 text-secondary-800"
                          >
                            {typeof cellule === "string" ? (
                              cellule
                            ) : (
                              <Badge variant={cellule.variant ?? "secondary"}>
                                {cellule.badge}
                              </Badge>
                            )}
                          </td>
                        ))}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {actionDeplacer && (
                              <>
                                <BoutonRang
                                  envoyer={envoyerRang}
                                  id={ligne.id}
                                  sens="monter"
                                  nom={String(nom)}
                                  inactif={rang === 0 || rangEnCours}
                                />
                                <BoutonRang
                                  envoyer={envoyerRang}
                                  id={ligne.id}
                                  sens="descendre"
                                  nom={String(nom)}
                                  inactif={
                                    rang === memeGroupe.length - 1 ||
                                    rangEnCours
                                  }
                                />
                              </>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setEdition({
                                  id: ligne.id,
                                  valeurs: ligne.valeurs,
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                              Modifier
                            </Button>

                            {actionSupprimer &&
                              (aConfirmer === ligne.id ? (
                                /* Deux temps : effacer est irréversible, un clic isolé ne suffit pas. */
                                <form
                                  action={envoyerSuppression}
                                  className="flex items-center gap-1"
                                >
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={ligne.id}
                                  />
                                  <span className="text-caption text-muted-foreground">
                                    Confirmer ?
                                  </span>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="destructive"
                                    disabled={suppressionEnCours}
                                  >
                                    {suppressionEnCours
                                      ? "Suppression…"
                                      : "Oui, supprimer"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setAConfirmer(null)}
                                  >
                                    Annuler
                                  </Button>
                                </form>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() => setAConfirmer(ligne.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  Supprimer
                                </Button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
        {nombrePages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 sm:px-5">
            <p className="text-xs text-muted-foreground">
              Page {pageCourante} sur {nombrePages}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pageCourante === 1} onClick={() => setPage((numero) => Math.max(1, numero - 1))}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Précédente</span>
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pageCourante === nombrePages} onClick={() => setPage((numero) => Math.min(nombrePages, numero + 1))}>
                <span className="hidden sm:inline">Suivante</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <p className="text-caption text-muted-foreground">
        {actionSupprimer
          ? "Une entrée citée par un dossier ne peut pas être supprimée : désactivez-la pour la retirer des formulaires."
          : "Aucune suppression n’est proposée : utilisez la désactivation."}
        {actionDeplacer &&
          " L’ordre est alphabétique tant que les flèches ne sont pas utilisées."}
      </p>
    </div>
  );
}

/**
 * Un bouton de rang est un FORMULAIRE, pas un `onClick`.
 *
 * Le déplacement est une écriture : il doit partir par une Server Action, qui revérifie la
 * permission. Le passer par un gestionnaire de clic obligerait à l'appeler à la main et priverait
 * la page du repli sans JavaScript.
 */
function BoutonRang({
  envoyer,
  id,
  sens,
  nom,
  inactif,
}: {
  envoyer: (donnees: FormData) => void;
  id: string;
  sens: "monter" | "descendre";
  nom: string;
  inactif: boolean;
}) {
  return (
    <form action={envoyer} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sens" value={sens} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={inactif}
        aria-label={`${sens === "monter" ? "Monter" : "Descendre"} ${nom}`}
        title={sens === "monter" ? "Monter" : "Descendre"}
      >
        {sens === "monter" ? (
          <ArrowUp className="h-4 w-4" aria-hidden />
        ) : (
          <ArrowDown className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </form>
  );
}

function Champ({
  champ,
  valeur,
}: {
  champ: ChampReferentiel;
  valeur: string | boolean | undefined;
}) {
  if (champ.type === "booleen") {
    return (
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={champ.nom}
            defaultChecked={valeur === true}
            value="1"
          />
          {champ.libelle}
        </label>
      </div>
    );
  }

  const commun = {
    id: champ.nom,
    name: champ.nom,
    required: champ.requis,
    defaultValue: typeof valeur === "string" ? valeur : "",
  };

  return (
    <div className={champ.type === "zone" ? "sm:col-span-2" : undefined}>
      <Label htmlFor={champ.nom} className="text-caption text-muted-foreground">
        {champ.libelle}
        {champ.requis && " *"}
      </Label>

      {champ.type === "texte" && (
        <Input {...commun} maxLength={champ.max} className="mt-1" />
      )}

      {champ.type === "zone" && (
        <textarea
          {...commun}
          rows={4}
          maxLength={champ.max}
          className={champCss}
        />
      )}

      {champ.type === "nombre" && (
        <input
          {...commun}
          type="number"
          min={champ.min ?? 0}
          className={champCss}
        />
      )}

      {champ.type === "liste" && (
        <select {...commun} className={champCss}>
          <option value="">{champ.vide ?? "— Sélectionner —"}</option>
          {champ.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      )}

      {champ.type === "zone" && champ.aide && (
        <p className="mt-1 text-caption text-muted-foreground">{champ.aide}</p>
      )}
    </div>
  );
}
