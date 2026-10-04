import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type MailleAriane = {
  readonly libelle: string
  readonly href?: string
}

export function FilAriane({ mailles }: { mailles: readonly MailleAriane[] }) {
  return (
    <nav aria-label="Fil d'Ariane">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {mailles.map((maille, index) => {
          const derniere = index === mailles.length - 1

          return (
            <li key={`${maille.libelle}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3 w-3 text-secondary-300" aria-hidden />}
              {maille.href && !derniere ? (
                <Link
                  href={maille.href}
                  className="rounded-md px-1 py-0.5 font-medium transition-colors hover:text-secondary-900 hover:bg-secondary-100/60"
                >
                  {maille.libelle}
                </Link>
              ) : (
                <span
                  aria-current={derniere ? 'page' : undefined}
                  className={derniere ? 'px-1 py-0.5 font-semibold text-secondary-800' : 'px-1 py-0.5'}
                >
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
