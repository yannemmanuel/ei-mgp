'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

type Referentiels = {
  parcours: { id: bigint; libelle: string }[]
  categories: { id: bigint; libelle: string }[]
  statuts: { id: bigint; libelle_interne: string }[]
  gravites: { id: bigint; libelle: string }[]
}

type Valeurs = {
  parcoursId?: string
  categorieId?: string
  statutId?: string
  niveauGraviteId?: string
  periodeDebut?: string
  periodeFin?: string
  assigneAMoi?: boolean
}

/**
 * EX-GES-01 : filtres de la liste des dossiers.
 *
 * L'état vit dans l'URL et non dans le composant : un filtre appliqué reste partageable et
 * survit à un rechargement, et le rendu reste entièrement serveur.
 */
export function FiltresDossiers({
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

    // Tout changement de filtre ramène à la première page : rester en page 5 d'un résultat qui
    // n'en compte plus que 2 afficherait une liste vide sans explication.
    suivants.delete('page')

    // Changer de parcours invalide la catégorie choisie, qui appartient à l'ancien parcours.
    if (cle === 'parcoursId') suivants.delete('categorieId')

    router.push(`/dossiers?${suivants.toString()}`)
  }

  const champ = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-caption text-muted-foreground">Parcours</Label>
          <select
            className={champ}
            value={valeurs.parcoursId ?? ''}
            onChange={(e) => appliquer('parcoursId', e.target.value)}
          >
            <option value="">Tous</option>
            {referentiels.parcours.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {p.libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">Catégorie</Label>
          <select
            className={champ}
            value={valeurs.categorieId ?? ''}
            onChange={(e) => appliquer('categorieId', e.target.value)}
          >
            <option value="">Toutes</option>
            {referentiels.categories.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">Statut</Label>
          <select
            className={champ}
            value={valeurs.statutId ?? ''}
            onChange={(e) => appliquer('statutId', e.target.value)}
          >
            <option value="">Tous</option>
            {referentiels.statuts.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.libelle_interne}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">Gravité</Label>
          <select
            className={champ}
            value={valeurs.niveauGraviteId ?? ''}
            onChange={(e) => appliquer('niveauGraviteId', e.target.value)}
          >
            <option value="">Toutes</option>
            {referentiels.gravites.map((g) => (
              <option key={String(g.id)} value={String(g.id)}>
                {g.libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-caption text-muted-foreground">Reçu à partir du</Label>
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

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={valeurs.assigneAMoi ?? false}
              onChange={(e) => appliquer('assigneAMoi', e.target.checked ? '1' : '')}
            />
            Qui me sont affectés
          </label>
        </div>

        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={() => router.push('/dossiers')}>
            Réinitialiser
          </Button>
        </div>
      </div>
    </Card>
  )
}
