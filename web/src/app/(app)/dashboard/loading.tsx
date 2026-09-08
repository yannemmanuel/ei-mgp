import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SqueletteEnTete } from '@/components/layout/squelettes'

export default function Chargement() {
  return (
    <div className="space-y-6">
      <SqueletteEnTete />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-2 w-full" />
            <Skeleton className="mt-3 h-2 w-4/5" />
            <Skeleton className="mt-3 h-2 w-3/5" />
          </Card>
        ))}
      </div>
    </div>
  )
}
