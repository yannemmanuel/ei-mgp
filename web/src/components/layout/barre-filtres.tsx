'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type OptionFiltre = { readonly valeur: string; readonly libelle: string }

export type ChampFiltre =
  | {
      readonly type: 'select'
      readonly cle: string
      readonly libelle: string
      /** Libellé de l'option « pas de filtre » — accordé au genre du champ. */
      readonly tous: string
      readonly options: readonly OptionFiltre[]
      /** Clés à effacer quand celle-ci change (ex. la catégorie dépend du parcours). */
      readonly invalide?: readonly string[]
    }
  | { readonly type: 'date'; readonly cle: string; readonly libelle: string }

export type BasculePersonnelle = {
  readonly cle: string
  readonly libelleTous: string
  readonly libelleMiens: string
}

/** Interrupteur indépendant de la bascule de périmètre — actif ou non, sans troisième état. */
export type InterrupteurFiltre = {
  readonly cle: string
  readonly libelle: string
  readonly aide?: string
}

/**
 * Barre de filtres commune aux listes.
 *
 * Les filtres occupaient jusqu'ici une carte de huit champs dépliée en permanence, au-dessus de
 * la liste : sur un écran d'ordinateur portable, les premières lignes de données commençaient
 * sous la ligne de flottaison. Or on filtre par exception et on lit toujours.
 *
 * D'où l'inversion : les champs sont repliés, et ce qui reste visible est ce qui AGIT — la
 * bascule « les miens / tous », et une puce par critère actif. Les puces répondent à la question
 * à laquelle la carte dépliée ne répondait pas, parce qu'il fallait relire huit champs pour y
 * arriver : pourquoi cette liste est-elle si courte ?
 *
 * L'état vit dans l'URL, jamais dans le composant : un filtre reste partageable, survit à un
 * rechargement, et le rendu demeure entièrement serveur.
 */
export function BarreFiltres({
  base,
  champs,
  valeurs,
  bascule,
  interrupteur,
}: {
  /** Chemin de la liste, ex. `/dossiers`. */
  base: string
  champs: readonly ChampFiltre[]
  valeurs: Readonly<Record<string, string | undefined>>
  bascule?: BasculePersonnelle
  interrupteur?: InterrupteurFiltre
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [deplie, setDeplie] = useState(false)

  function naviguer(modifier: (p: URLSearchParams) => void) {
    const suivants = new URLSearchParams(params.toString())
    modifier(suivants)

    // Tout changement de critère ramène à la première page : rester en page 5 d'un résultat qui
    // n'en compte plus que 2 afficherait une liste vide sans explication.
    suivants.delete('page')

    const query = suivants.toString()
    router.push(query === '' ? base : `${base}?${query}`)
  }

  function appliquer(champ: ChampFiltre, valeur: string) {
    naviguer((p) => {
      if (valeur === '') p.delete(champ.cle)
      else p.set(champ.cle, valeur)

      if (champ.type === 'select') {
        for (const dependante of champ.invalide ?? []) p.delete(dependante)
      }
    })
  }

  // Une puce par critère actif, avec son libellé lisible — « Parcours : EI Employé », jamais
  // « parcoursId=2 ».
  const actifs = useMemo(() => {
    return champs
      .map((champ) => {
        const valeur = valeurs[champ.cle]
        if (!valeur) return null

        const lisible =
          champ.type === 'select'
            ? champ.options.find((o) => o.valeur === valeur)?.libelle
            : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(valeur))

        // Une valeur d'URL qui ne correspond à aucune option existante n'est pas affichée sous
        // son identifiant brut : la puce dirait alors moins que rien.
        return lisible ? { cle: champ.cle, libelle: champ.libelle, valeur: lisible } : null
      })
      .filter((chip) => chip !== null)
  }, [champs, valeurs])

  const surBascule = bascule ? valeurs[bascule.cle] === '1' : false
  const champStyle =
    'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {bascule && (
          <div
            role="group"
            aria-label="Périmètre"
            className="inline-flex rounded-md bg-muted p-0.5 text-sm"
          >
            {[
              { actif: !surBascule, libelle: bascule.libelleTous, valeur: '' },
              { actif: surBascule, libelle: bascule.libelleMiens, valeur: '1' },
            ].map((choix) => (
              <button
                key={choix.libelle}
                type="button"
                aria-pressed={choix.actif}
                onClick={() =>
                  naviguer((p) => {
                    if (choix.valeur === '') p.delete(bascule.cle)
                    else p.set(bascule.cle, choix.valeur)
                  })
                }
                className={cn(
                  'rounded-[5px] px-3 py-1 font-medium transition-colors',
                  choix.actif
                    ? 'bg-background text-secondary-900 shadow-sm'
                    : 'text-secondary-600 hover:text-secondary-900'
                )}
              >
                {choix.libelle}
              </button>
            ))}
          </div>
        )}

        {interrupteur && (
          <button
            type="button"
            aria-pressed={valeurs[interrupteur.cle] === '1'}
            title={interrupteur.aide}
            onClick={() =>
              naviguer((p) => {
                if (valeurs[interrupteur.cle] === '1') p.delete(interrupteur.cle)
                else p.set(interrupteur.cle, '1')
              })
            }
            className={cn(
              'rounded-md border px-3 py-1 text-sm font-medium transition-colors',
              valeurs[interrupteur.cle] === '1'
                ? 'border-primary-600 bg-primary-50 text-primary-800'
                : 'border-border text-secondary-600 hover:bg-muted'
            )}
          >
            {interrupteur.libelle}
          </button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeplie((v) => !v)}
          aria-expanded={deplie}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filtres
          {actifs.length > 0 && (
            <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold text-primary-foreground">
              {actifs.length}
            </span>
          )}
        </Button>

        {actifs.map((chip) => (
          <button
            key={chip.cle}
            type="button"
            onClick={() => naviguer((p) => p.delete(chip.cle))}
            className="inline-flex items-center gap-1.5 rounded-4xl border border-border bg-background py-1 pl-2.5 pr-1.5 text-caption text-secondary-700 transition-colors hover:border-secondary-300 hover:bg-muted"
          >
            <span>
              <span className="text-muted-foreground">{chip.libelle} :</span> {chip.valeur}
            </span>
            <X className="h-3 w-3 text-secondary-400" aria-hidden />
            <span className="sr-only">Retirer ce filtre</span>
          </button>
        ))}

        {actifs.length > 1 && (
          <button
            type="button"
            onClick={() =>
              naviguer((p) => {
                for (const champ of champs) p.delete(champ.cle)
              })
            }
            className="text-caption text-muted-foreground underline underline-offset-2 hover:text-secondary-900"
          >
            Tout effacer
          </button>
        )}
      </div>

      {deplie && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {champs.map((champ) => (
              <div key={champ.cle}>
                <Label className="text-caption text-muted-foreground">{champ.libelle}</Label>
                {champ.type === 'select' ? (
                  <select
                    className={champStyle}
                    value={valeurs[champ.cle] ?? ''}
                    onChange={(e) => appliquer(champ, e.target.value)}
                  >
                    <option value="">{champ.tous}</option>
                    {champ.options.map((option) => (
                      <option key={option.valeur} value={option.valeur}>
                        {option.libelle}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    className={champStyle}
                    value={valeurs[champ.cle] ?? ''}
                    onChange={(e) => appliquer(champ, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
