import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EtatVide({
  icone: Icone,
  titre,
  description,
  action,
  className,
}: {
  icone: LucideIcon
  titre: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-50 border border-secondary-100 shadow-xs">
        <Icone className="h-6 w-6 text-secondary-400" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-semibold text-secondary-900">{titre}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
