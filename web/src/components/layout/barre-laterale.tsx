'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  ClipboardCheck,
  FolderOpen,
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
  cog: Settings,
  shield: ShieldCheck,
}

export function BarreLaterale({ sections }: { sections: SectionNavigation[] }) {
  const cheminActuel = usePathname()

  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-6 p-4 text-sm">
      {sections.map((section, index) => (
        <div key={section.titre ?? `section-${index}`}>
          {section.titre && (
            <p className="px-3 text-label uppercase tracking-wide text-secondary-400">
              {section.titre}
            </p>
          )}

          <div className={cn('space-y-1', section.titre && 'mt-1')}>
            {section.liens.map((lien) => {
              const Icone = ICONES[lien.icone] ?? FolderOpen
              const cheminLien = lien.href.split('?')[0]
              // `/dossiers` ne doit pas être « actif » quand on est sur `/dossiers-autre` :
              // on compare des segments entiers.
              const actif =
                cheminActuel === cheminLien || cheminActuel.startsWith(`${cheminLien}/`)

              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  aria-current={actif ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors',
                    actif
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-secondary-600 hover:bg-white hover:text-secondary-900'
                  )}
                >
                  <Icone className="h-5 w-5 shrink-0" aria-hidden />
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
