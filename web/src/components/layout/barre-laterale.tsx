'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  ClipboardCheck,
  FolderOpen,
  Inbox,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SectionNavigation } from './navigation'

const ICONES: Record<string, LucideIcon> = {
  'chart-bar': BarChart3,
  folder: FolderOpen,
  clipboard: ClipboardCheck,
  wrench: Wrench,
  inbox: Inbox,
  cog: Settings,
  shield: ShieldCheck,
}

export function BarreLaterale({
  sections,
  onNaviguer,
}: {
  sections: SectionNavigation[]
  /** Referme le tiroir mobile après un clic : sans cela il masque la page qu'on vient d'ouvrir. */
  onNaviguer?: () => void
}) {
  const cheminActuel = usePathname()

  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-5 p-3 text-sm">
      {sections.map((section, index) => (
        <div key={section.titre ?? `section-${index}`}>
          {section.titre && (
            <p className="px-3 pb-1 text-label uppercase tracking-wide text-secondary-400">
              {section.titre}
            </p>
          )}

          <div className="space-y-0.5">
            {section.liens.map((lien) => {
              const cheminLien = lien.href.split('?')[0]
              // `/dossiers` ne doit pas être « actif » quand on est sur `/dossiers-autre` :
              // on compare des segments entiers.
              const actif =
                cheminActuel === cheminLien || cheminActuel.startsWith(`${cheminLien}/`)
              const Icone = ICONES[lien.icone] ?? FolderOpen

              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  onClick={onNaviguer}
                  aria-current={actif ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-2.5 rounded-md py-2 pl-3 pr-2 font-medium transition-colors',
                    actif
                      ? 'bg-primary-100 text-primary-800'
                      : 'text-secondary-600 hover:bg-white hover:text-secondary-900'
                  )}
                >
                  {/* Repère latéral : la couleur de fond seule ne suffit pas à un œil qui balaie
                      la colonne, et elle disparaît à l'impression comme en contraste réduit. */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-colors',
                      actif ? 'bg-primary-600' : 'bg-transparent'
                    )}
                  />
                  <Icone
                    className={cn('h-[18px] w-[18px] shrink-0', actif ? 'text-primary-700' : 'text-secondary-400')}
                    aria-hidden
                  />
                  {lien.libelle}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
