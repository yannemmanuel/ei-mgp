import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * État vide.
 *
 * Une liste vide a deux causes très différentes, et les confondre fait perdre du temps : soit il
 * n'y a rien à voir, soit les filtres sont trop étroits. Le second cas doit proposer la sortie
 * (`action`), sans quoi l'utilisateur relit ses critères un par un.
 */
export function EtatVide({
  icone: Icone,
  titre,
  description,
  action,
}: {
  icone: LucideIcon
  titre: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icone className="h-5 w-5 text-secondary-400" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-secondary-900">{titre}</p>
      {description && (
        <p className="mt-1 max-w-sm text-caption text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
