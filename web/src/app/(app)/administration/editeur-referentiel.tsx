'use client'

import { useActionState, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { useRetourEnToast } from '@/lib/retour-operation'

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
  | { type: 'texte'; nom: string; libelle: string; requis?: boolean; max?: number }
  | { type: 'zone'; nom: string; libelle: string; requis?: boolean; max?: number; aide?: string }
  | { type: 'nombre'; nom: string; libelle: string; requis?: boolean; min?: number }
  | { type: 'booleen'; nom: string; libelle: string }
  | {
      type: 'liste'
      nom: string
      libelle: string
      options: { valeur: string; libelle: string }[]
      requis?: boolean
      vide?: string
    }

export type ValeursLigne = Record<string, string | boolean>

export type LigneReferentiel = {
  id: string
  cellules: (string | { badge: string; variant?: 'default' | 'secondary' | 'destructive' })[]
  valeurs: ValeursLigne
  /**
   * Groupe auquel la ligne appartient — le parcours d'une catégorie, la direction d'un poste.
   *
   * Sert au seul calcul des extrémités : monter la première ligne d'un parcours ne doit pas la
   * faire passer dans le parcours précédent. Absent, tout le tableau ne forme qu'un groupe.
   */
  groupe?: string
}

export type EtatFormulaire = { erreur?: string; succes?: string }

type ActionReferentiel = (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>

type Props = {
  titre: string
  description?: string
  colonnes: string[]
  lignes: LigneReferentiel[]
  champs: ChampReferentiel[]
  action: ActionReferentiel
  /** Faux pour un référentiel dont les lignes sont fixées (statuts, canaux). */
  creationPossible: boolean
  libelleCreation?: string
  messageVide?: string
  /**
   * Déplacement d'une ligne d'un rang. Absente, aucun bouton de rang n'est rendu.
   *
   * Le rang ne s'écrit plus à la main depuis le 11/09/2026 : tant que les lignes d'un groupe le
   * partagent, l'affichage est alphabétique. Ces boutons servent aux listes où l'ordre porte un
   * sens que l'alphabet ignore — une échelle d'ancienneté, par exemple.
   */
  actionDeplacer?: ActionReferentiel
  /**
   * Suppression d'une ligne. Absente, aucun bouton de suppression n'est rendu.
   *
   * ⚠️ Ce n'est pas parce que le bouton est là que la ligne partira : le service compte d'abord
   * ce qui la cite et refuse tant que ce compte n'est pas nul (RG-03). Le refus revient dans
   * `erreur`, avec son motif.
   */
  actionSupprimer?: ActionReferentiel
}

const ETAT: EtatFormulaire = {}
const champCss = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

/** Action neutre : `useActionState` ne peut pas être appelé conditionnellement. */
const INERTE: ActionReferentiel = async (etat) => etat

export function EditeurReferentiel({
  titre,
  description,
  colonnes,
  lignes,
  champs,
  action,
  creationPossible,
  libelleCreation = 'Ajouter',
  messageVide = 'Aucune entrée.',
  actionDeplacer,
  actionSupprimer,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)
  const [etatRang, envoyerRang, rangEnCours] = useActionState(actionDeplacer ?? INERTE, ETAT)
  const [etatSuppression, envoyerSuppression, suppressionEnCours] = useActionState(
    actionSupprimer ?? INERTE,
    ETAT
  )
  const [edition, setEdition] = useState<{ id: string; valeurs: ValeursLigne } | null>(null)
  /** Ligne dont la suppression attend confirmation — un clic ne suffit pas à effacer. */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)

  const valeursVides: ValeursLigne = Object.fromEntries(
    champs.map((c) => [c.nom, c.type === 'booleen' ? true : ''])
  )

  // Les trois retours partent en notification. Ils n'ont plus de place réservée dans la page :
  // l'encart de succès poussait le tableau vers le bas à chaque enregistrement.
  useRetourEnToast(etat)
  useRetourEnToast(etatRang)
  useRetourEnToast(etatSuppression)

  return (
    <div className="space-y-6">
      <EnTetePage
        titre={titre}
        lede={description}
        mailles={[{ libelle: 'Administration', href: '/administration' }, { libelle: titre }]}
        actions={
          creationPossible && edition === null ? (
            <Button size="sm" onClick={() => setEdition({ id: '', valeurs: valeursVides })}>
              {libelleCreation}
            </Button>
          ) : null
        }
      />

      {edition !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">
              {edition.id === '' ? libelleCreation : 'Modifier'}
            </CardTitle>
          </CardHeader>
          <CardContent>
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

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={enCours}>
                  {enCours ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEdition(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {lignes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{messageVide}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {colonnes.map((colonne) => (
                      <th key={colonne} className="px-4 py-2 font-medium text-muted-foreground">
                        {colonne}
                      </th>
                    ))}
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne, index) => {
                    const groupe = ligne.groupe ?? ''
                    const memeGroupe = lignes.filter((l) => (l.groupe ?? '') === groupe)
                    const rang = memeGroupe.indexOf(ligne)
                    const nom = ligne.cellules.find((c) => typeof c === 'string') ?? `ligne ${index + 1}`

                    return (
                      <tr key={ligne.id} className="border-b border-border/50">
                        {ligne.cellules.map((cellule, colonne) => (
                          <td
                            key={colonnes[colonne] ?? colonne}
                            className="px-4 py-2 text-secondary-800"
                          >
                            {typeof cellule === 'string' ? (
                              cellule
                            ) : (
                              <Badge variant={cellule.variant ?? 'secondary'}>{cellule.badge}</Badge>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2">
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
                                  inactif={rang === memeGroupe.length - 1 || rangEnCours}
                                />
                              </>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEdition({ id: ligne.id, valeurs: ligne.valeurs })}
                            >
                              Modifier
                            </Button>

                            {actionSupprimer &&
                              (aConfirmer === ligne.id ? (
                                /* Deux temps : effacer est irréversible, un clic isolé ne suffit pas. */
                                <form action={envoyerSuppression} className="flex items-center gap-1">
                                  <input type="hidden" name="id" value={ligne.id} />
                                  <span className="text-caption text-muted-foreground">Confirmer ?</span>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="destructive"
                                    disabled={suppressionEnCours}
                                  >
                                    {suppressionEnCours ? 'Suppression…' : 'Oui, supprimer'}
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
                                  Supprimer
                                </Button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-caption text-muted-foreground">
        {actionSupprimer
          ? 'Une entrée citée par un dossier ne peut pas être supprimée : désactivez-la pour la retirer des formulaires.'
          : 'Aucune suppression n’est proposée : utilisez la désactivation.'}
        {actionDeplacer &&
          ' L’ordre est alphabétique tant que les flèches ne sont pas utilisées.'}
      </p>
    </div>
  )
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
  envoyer: (donnees: FormData) => void
  id: string
  sens: 'monter' | 'descendre'
  nom: string
  inactif: boolean
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
        aria-label={`${sens === 'monter' ? 'Monter' : 'Descendre'} ${nom}`}
        title={sens === 'monter' ? 'Monter' : 'Descendre'}
      >
        {sens === 'monter' ? '↑' : '↓'}
      </Button>
    </form>
  )
}

function Champ({ champ, valeur }: { champ: ChampReferentiel; valeur: string | boolean | undefined }) {
  if (champ.type === 'booleen') {
    return (
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={champ.nom} defaultChecked={valeur === true} value="1" />
          {champ.libelle}
        </label>
      </div>
    )
  }

  const commun = {
    id: champ.nom,
    name: champ.nom,
    required: champ.requis,
    defaultValue: typeof valeur === 'string' ? valeur : '',
  }

  return (
    <div className={champ.type === 'zone' ? 'sm:col-span-2' : undefined}>
      <Label htmlFor={champ.nom} className="text-caption text-muted-foreground">
        {champ.libelle}
        {champ.requis && ' *'}
      </Label>

      {champ.type === 'texte' && <Input {...commun} maxLength={champ.max} className="mt-1" />}

      {champ.type === 'zone' && <textarea {...commun} rows={4} maxLength={champ.max} className={champCss} />}

      {champ.type === 'nombre' && (
        <input {...commun} type="number" min={champ.min ?? 0} className={champCss} />
      )}

      {champ.type === 'liste' && (
        <select {...commun} className={champCss}>
          <option value="">{champ.vide ?? '— Sélectionner —'}</option>
          {champ.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      )}

      {champ.type === 'zone' && champ.aide && (
        <p className="mt-1 text-caption text-muted-foreground">{champ.aide}</p>
      )}
    </div>
  )
}
