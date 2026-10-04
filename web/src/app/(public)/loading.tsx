import { Skeleton } from '@/components/ui/skeleton'

/**
 * Repli de chargement du front-office public.
 *
 * ⚠️ IL GARDE LE PANNEAU DE RÉASSURANCE EN PLACE, et c'est sa vraie raison d'être. Sans
 * frontière de chargement, une navigation dans ce groupe blanchit la page ENTIÈRE — accroche,
 * étapes et tout — alors que `(public)/layout.tsx` explique que « la réassurance doit être
 * constante pour un déclarant qui peut être en situation de méfiance ». Ici, seul le contenu de
 * `<main>` se recompose.
 *
 * ⚠️ LA FORME DU SQUELETTE SUIT CELLE DES PAGES — titre, deux lignes d'accroche, puis des
 * champs. Un squelette qui ne ressemble pas à ce qui arrive produit un décalage au moment du
 * remplacement, ce qui est pire que pas de squelette du tout.
 */
export default function Chargement() {
  return (
    <div className="mx-auto max-w-lg">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />

      <div className="mt-8 space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-1/2" />
      </div>
    </div>
  )
}
