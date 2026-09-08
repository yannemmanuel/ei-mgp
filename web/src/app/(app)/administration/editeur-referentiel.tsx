'use client'

import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EnTetePage } from '@/components/layout/en-tete-page'

/**
 * Éditeur commun aux référentiels d'administration.
 *
 * Cinq écrans (catégories, statuts, sites, canaux, gabarits) ont exactement la même forme :
 * une table, un formulaire, aucune suppression. Les écrire cinq fois multiplierait les endroits
 * où une règle peut diverger — notamment l'absence de suppression, qui n'est pas une commodité
 * mais une contrainte d'intégrité (RG-03).
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
}

export type EtatFormulaire = { erreur?: string; succes?: string }

type Props = {
  titre: string
  description?: string
  colonnes: string[]
  lignes: LigneReferentiel[]
  champs: ChampReferentiel[]
  action: (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>
  /** Faux pour un référentiel dont les lignes sont fixées (statuts, canaux). */
  creationPossible: boolean
  libelleCreation?: string
  messageVide?: string
}

const ETAT: EtatFormulaire = {}
const champCss = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

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
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)
  const [edition, setEdition] = useState<{ id: string; valeurs: ValeursLigne } | null>(null)

  const valeursVides: ValeursLigne = Object.fromEntries(
    champs.map((c) => [c.nom, c.type === 'booleen' ? true : ''])
  )

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

      {etat.succes && (
        <Alert>
          <AlertDescription>{etat.succes}</AlertDescription>
        </Alert>
      )}

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

              <div className="grid gap-4 sm:grid-cols-2">
                {champs.map((champ) => (
                  <Champ key={champ.nom} champ={champ} valeur={edition.valeurs[champ.nom]} />
                ))}
              </div>

              {etat.erreur && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{etat.erreur}</AlertDescription>
                </Alert>
              )}

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
                  {lignes.map((ligne) => (
                    <tr key={ligne.id} className="border-b border-border/50">
                      {ligne.cellules.map((cellule, index) => (
                        <td key={colonnes[index] ?? index} className="px-4 py-2 text-secondary-800">
                          {typeof cellule === 'string' ? (
                            cellule
                          ) : (
                            <Badge variant={cellule.variant ?? 'secondary'}>{cellule.badge}</Badge>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEdition({ id: ligne.id, valeurs: ligne.valeurs })}
                        >
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-caption text-muted-foreground">
        Aucune suppression n’est proposée : une entrée déjà citée par un dossier ne peut pas
        disparaître sans rendre l’historique incohérent. Utilisez la désactivation.
      </p>
    </div>
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
