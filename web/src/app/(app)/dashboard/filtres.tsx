'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

type Option = { id: string; libelle: string }

type Referentiels = {
  parcours: Option[]
  categories: Option[]
  statuts: Option[]
  gravites: Option[]
  sites: Option[]
  directions: Option[]
}

type Valeurs = Record<string, string | undefined>

/**
 * EX-REP-02 : filtres du tableau de bord — sur-ensemble de ceux de la liste des dossiers
 * (ajoute site et direction).
 *
 * L'état vit dans l'URL : un tableau de bord filtré reste partageable, et les liens d'export
 * n'ont qu'à recopier les mêmes paramètres pour porter exactement le même périmètre.
 */
export function FiltresReporting({
  referentiels,
  valeurs,
}: {
  referentiels: Referentiels
  valeurs: Valeurs
}) {
  const router = useRouter()
  const params = useSearchParams()

  function appliquer(cle: string, valeur: string) {
    const suivants = new URLSearchParams(params.toString())

    if (valeur === '') suivants.delete(cle)
    else suivants.set(cle, valeur)

    // Changer de parcours invalide la catégorie choisie, qui appartient à l'ancien parcours.
    if (cle === 'parcoursId') suivants.delete('categorieId')

    router.push(`/dashboard?${suivants.toString()}`)
  }

  const champ = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

  const listes: { cle: string; libelle: string; vide: string; options: Option[] }[] = [
    { cle: 'parcoursId', libelle: 'Parcours', vide: 'Tous', options: referentiels.parcours },
    { cle: 'categorieId', libelle: 'Catégorie', vide: 'Toutes', options: referentiels.categories },
    { cle: 'statutId', libelle: 'Statut', vide: 'Tous', options: referentiels.statuts },
    { cle: 'niveauGraviteId', libelle: 'Gravité', vide: 'Toutes', options: referentiels.gravites },
    { cle: 'siteId', libelle: 'Site', vide: 'Tous', options: referentiels.sites },
    { cle: 'directionId', libelle: 'Direction', vide: 'Toutes', options: referentiels.directions },
  ]

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {listes.map((liste) => (
          <div key={liste.cle}>
            <Label className="text-caption text-muted-foreground">{liste.libelle}</Label>
            <select
              className={champ}
              value={valeurs[liste.cle] ?? ''}
              onChange={(e) => appliquer(liste.cle, e.target.value)}
            >
              <option value="">{liste.vide}</option>
              {liste.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.libelle}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div>
          <Label className="text-caption text-muted-foreground">Soumis à partir du</Label>
          <input
            type="date"
            className={champ}
            value={valeurs.periodeDebut ?? ''}
            onChange={(e) => appliquer('periodeDebut', e.target.value)}
          />
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">Jusqu’au</Label>
          <input
            type="date"
            className={champ}
            value={valeurs.periodeFin ?? ''}
            onChange={(e) => appliquer('periodeFin', e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
          Réinitialiser
        </Button>
      </div>
    </Card>
  )
}
