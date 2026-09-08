'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

/**
 * Filtres du journal d'audit.
 *
 * L'état vit dans l'URL : une recherche d'audit est souvent partagée dans un échange
 * (« regarde ces lignes »), et doit rester reproductible à l'identique.
 */
export function FiltresAudit({
  actions,
  valeurs,
}: {
  actions: { readonly valeur: string; readonly libelle: string }[]
  valeurs: { action?: string; dateDebut?: string; dateFin?: string }
}) {
  const router = useRouter()
  const params = useSearchParams()

  function appliquer(cle: string, valeur: string) {
    const suivants = new URLSearchParams(params.toString())

    if (valeur === '') suivants.delete(cle)
    else suivants.set(cle, valeur)

    // Tout changement de filtre ramène en première page.
    suivants.delete('page')

    router.push(`/audit?${suivants.toString()}`)
  }

  const champ = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-caption text-muted-foreground">Action</Label>
          <select
            className={champ}
            value={valeurs.action ?? ''}
            onChange={(e) => appliquer('action', e.target.value)}
          >
            <option value="">Toutes</option>
            {actions.map((action) => (
              <option key={action.valeur} value={action.valeur}>
                {action.libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">À partir du</Label>
          <input
            type="date"
            className={champ}
            value={valeurs.dateDebut ?? ''}
            onChange={(e) => appliquer('dateDebut', e.target.value)}
          />
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">Jusqu’au</Label>
          <input
            type="date"
            className={champ}
            value={valeurs.dateFin ?? ''}
            onChange={(e) => appliquer('dateFin', e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={() => router.push('/audit')}>
            Réinitialiser
          </Button>
        </div>
      </div>
    </Card>
  )
}
