import { cn } from '@/lib/utils'

export type TonStatut = 'neutre' | 'encours' | 'attention' | 'succes' | 'alerte'

const TONS: Record<TonStatut, { badge: string; dot: string }> = {
  neutre: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200/80',
    dot: 'bg-slate-400',
  },
  encours: {
    badge: 'bg-blue-50 text-blue-800 border-blue-200/70',
    dot: 'bg-blue-500',
  },
  attention: {
    badge: 'bg-amber-50 text-amber-900 border-amber-200/70',
    dot: 'bg-amber-500',
  },
  succes: {
    badge: 'bg-primary-50 text-primary-900 border-primary-200/70',
    dot: 'bg-primary-600',
  },
  alerte: {
    badge: 'bg-rose-50 text-rose-800 border-rose-200/70',
    dot: 'bg-rose-500',
  },
}

export function EtiquetteStatut({
  ton = 'neutre',
  children,
  className,
  avecPastille = true,
}: {
  ton?: TonStatut
  children: React.ReactNode
  className?: string
  avecPastille?: boolean
}) {
  const config = TONS[ton] ?? TONS.neutre

  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold shadow-2xs',
        config.badge,
        className
      )}
    >
      {avecPastille && (
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dot)} aria-hidden="true" />
      )}
      {children}
    </span>
  )
}
