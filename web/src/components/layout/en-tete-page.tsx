import type { ReactNode } from 'react'
import { FilAriane, type MailleAriane } from './fil-ariane'

/**
 * En-tête commun à toutes les pages du back-office.
 *
 * Avant, chaque page composait son propre titre : certaines avec un compteur à droite, d'autres
 * avec un paragraphe de trois lignes, d'autres avec rien. L'œil devait réapprendre la page à
 * chaque navigation. Une seule structure — fil d'Ariane, titre, une phrase, actions — rend le
 * repérage automatique.
 *
 * `lede` tient en UNE phrase : ce qu'on trouve ici et pour quoi faire. Tout ce qui explique une
 * règle métier appartient à la page, pas à son en-tête.
 */
export function EnTetePage({
  titre,
  lede,
  mailles,
  compteur,
  actions,
}: {
  titre: string
  lede?: string
  mailles?: readonly MailleAriane[]
  /** Volumétrie du contenu affiché, ex. « 42 dossiers ». */
  compteur?: string
  actions?: ReactNode
}) {
  return (
    <header className="space-y-2">
      {mailles && mailles.length > 0 && <FilAriane mailles={mailles} />}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-h1 text-secondary-900">{titre}</h1>
            {compteur && <p className="text-caption text-muted-foreground">{compteur}</p>}
          </div>
          {lede && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lede}</p>}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
