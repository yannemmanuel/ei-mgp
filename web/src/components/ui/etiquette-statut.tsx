import { cn } from '@/lib/utils'

/**
 * Étiquette de statut à ton sémantique.
 *
 * Les badges de l'application se répartissaient jusqu'ici entre `secondary` (gris) et
 * `destructive` (rouge) : « validée », « en cours » et « non démarrée » portaient donc le même
 * gris, alors que ce sont trois situations différentes. Quatre tons suffisent à les distinguer,
 * et les fixer ici évite qu'un cinquième apparaisse au fil des écrans.
 *
 * Le ton ne remplace jamais le texte : la couleur seule exclut les daltonismes et disparaît à
 * l'impression, sur laquelle repose une bonne part du travail de conformité.
 */
export type TonStatut = 'neutre' | 'encours' | 'attention' | 'succes' | 'alerte'

const TONS: Record<TonStatut, string> = {
  neutre: 'bg-muted text-secondary-600 ring-secondary-200',
  encours: 'bg-secondary-50 text-secondary-700 ring-secondary-200',
  attention: 'bg-accent-50 text-accent-800 ring-accent-200',
  succes: 'bg-primary-50 text-primary-800 ring-primary-200',
  alerte: 'bg-destructive/10 text-destructive ring-destructive/20',
}

export function EtiquetteStatut({
  ton = 'neutre',
  children,
  className,
}: {
  ton?: TonStatut
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center whitespace-nowrap rounded-4xl px-2 text-xs font-medium ring-1 ring-inset',
        TONS[ton],
        className
      )}
    >
      {children}
    </span>
  )
}
