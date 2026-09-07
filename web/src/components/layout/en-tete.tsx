'use client'

import { Menu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { NotificationVue } from '@/server/services/notification/boite'
import type { SectionNavigation } from './navigation'
import { BarreLaterale } from './barre-laterale'
import { ClocheNotifications } from './cloche-notifications'

type Props = {
  nom: string
  roles: readonly string[]
  sections: SectionNavigation[]
  actionDeconnexion: () => Promise<void>
  notifications: NotificationVue[]
  nonLues: number
}

export function EnTete({
  nom,
  roles,
  sections,
  actionDeconnexion,
  notifications,
  nonLues,
}: Props) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4">
      {/* Navigation repliée en tiroir sous le point de rupture lg. */}
      <Sheet>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir la navigation" />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation principale</SheetTitle>
          <BarreLaterale sections={sections} />
        </SheetContent>
      </Sheet>

      <div className="ml-auto flex items-center gap-3 text-sm">
        <ClocheNotifications notifications={notifications} nonLues={nonLues} />
        <span className="hidden text-secondary-700 sm:inline">{nom}</span>
        {roles.map((role) => (
          <Badge key={role} variant="secondary" className="hidden font-normal sm:inline-flex">
            {role}
          </Badge>
        ))}
        <form action={actionDeconnexion}>
          <Button type="submit" variant="ghost" size="sm">
            Se déconnecter
          </Button>
        </form>
      </div>
    </header>
  )
}
