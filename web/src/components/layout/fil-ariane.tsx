import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type MailleAriane = {
  readonly libelle: string
  /** Absent sur la dernière maille : la page courante n'est pas un lien vers elle-même. */
  readonly href?: string
}

/**
 * Fil d'Ariane des pages profondes.
 *
 * Il remplace le « ← Retour à la liste » isolé, qui ne dit qu'une chose : où l'on va en arrière.
 * Un fil dit aussi où l'on EST, et permet de remonter de plusieurs crans d'un seul geste — sur
 * `/administration/gravites`, retrouver `/administration` demandait jusqu'ici de repasser par la
 * barre latérale.
 */
export function FilAriane({ mailles }: { mailles: readonly MailleAriane[] }) {
  return (
    <nav aria-label="Fil d’Ariane">
      <ol className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
        {mailles.map((maille, index) => {
          const derniere = index === mailles.length - 1

          return (
            <li key={`${maille.libelle}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3 text-secondary-300" aria-hidden />}
              {maille.href && !derniere ? (
                <Link
                  href={maille.href}
                  className="rounded-sm px-0.5 transition-colors hover:text-secondary-900"
                >
                  {maille.libelle}
                </Link>
              ) : (
                <span aria-current={derniere ? 'page' : undefined} className="px-0.5 text-secondary-700">
                  {maille.libelle}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
