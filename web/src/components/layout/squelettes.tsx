import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Squelettes de chargement.
 *
 * Une page du back-office lit la base à chaque affichage (`force-dynamic`) : entre le clic et le
 * rendu, il s'écoule un délai réel. Sans repère, l'écran précédent reste figé et le clic paraît
 * n'avoir rien produit — beaucoup de gens cliquent alors une seconde fois. Un squelette rend la
 * navigation immédiate : la nouvelle page est là, seul son contenu manque encore.
 *
 * Leur forme approche celle du contenu attendu, sans chercher à l'imiter exactement : un
 * squelette qui promet quatre colonnes alors qu'il en arrivera six est plus déroutant qu'un
 * squelette franchement approximatif.
 */
export function SqueletteEnTete() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-7 w-56" />
    </div>
  )
}

export function SqueletteTableau({ lignes = 8 }: { lignes?: number }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: lignes }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-28 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 shrink-0 rounded-4xl" />
            <Skeleton className="hidden h-4 w-24 shrink-0 sm:block" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function SqueletteCartes({ nombre = 6 }: { nombre?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: nombre }, (_, index) => (
        <Card key={index} className="p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </Card>
      ))}
    </div>
  )
}

/** Squelette générique : sert de repli à tout le groupe `(app)`. */
export function SqueletteListe() {
  return (
    <div className="space-y-6">
      <SqueletteEnTete />
      <SqueletteTableau />
    </div>
  )
}
