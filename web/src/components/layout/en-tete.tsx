'use client'

import { useState } from 'react'
import Link from 'next/link'
import { KeyRound, LogOut, Menu } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { NotificationVue } from '@/server/services/notification/boite'
import type { SectionNavigation } from './navigation'
import { BarreLaterale } from './barre-laterale'
import { ClocheNotifications } from './cloche-notifications'

type Props = {
  nom: string
  /** Rôles déjà traduits côté serveur : la barre n'affiche jamais d'identifiant technique. */
  roles: readonly string[]
  sections: SectionNavigation[]
  actionDeconnexion: () => Promise<void>
  notifications: NotificationVue[]
  nonLues: number
}

/** « Marie-Claire N'Guessan » → « MN ». Deux lettres au plus : au-delà, la pastille devient illisible. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s-]+/).filter(Boolean)
  if (mots.length === 0) return '?'

  return (mots[0][0] + (mots.length > 1 ? mots[mots.length - 1][0] : '')).toUpperCase()
}

/**
 * Barre supérieure.
 *
 * Le nom, les rôles et « Se déconnecter » occupaient en permanence le coin droit, les rôles sous
 * leur identifiant technique (`admin_digital`). Trois informations consultées rarement, dont une
 * illisible. Elles sont regroupées dans un menu de compte : la barre ne garde que ce qui appelle
 * une action — les notifications — et l'identité, réduite à sa pastille.
 */
export function EnTete({
  nom,
  roles,
  sections,
  actionDeconnexion,
  notifications,
  nonLues,
}: Props) {
  const [tiroirOuvert, setTiroirOuvert] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Navigation repliée en tiroir sous le point de rupture lg. */}
      <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir la navigation" />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation principale</SheetTitle>
          <BarreLaterale sections={sections} onNaviguer={() => setTiroirOuvert(false)} />
        </SheetContent>
      </Sheet>

      <div className="ml-auto flex items-center gap-1.5">
        <ClocheNotifications notifications={notifications} nonLues={nonLues} />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 pl-1.5 pr-2"
                aria-label={`Compte de ${nom}`}
              />
            }
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary-100 text-[11px] font-semibold text-primary-800">
                {initiales(nom)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm font-normal text-secondary-700 sm:inline">
              {nom}
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-secondary-900">{nom}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                {roles.length === 0 ? 'Aucun rôle attribué' : roles.join(' · ')}
              </p>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem render={<Link href="/mot-de-passe" />}>
              <KeyRound className="h-4 w-4" aria-hidden />
              Changer mon mot de passe
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Le bouton vit dans le menu, le formulaire en dehors : Base UI place le contenu du
                menu dans un portail et le referme au clic. Un formulaire imbriqué serait démonté
                avant d'avoir soumis. L'attribut `form` fait le lien par identifiant, à travers
                l'arbre, et la déconnexion reste une vraie soumission — donc une navigation, pas
                un appel dont il faudrait gérer l'échec à la main. */}
            <DropdownMenuItem
              render={<button type="submit" form="deconnexion" className="w-full" />}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <form id="deconnexion" action={actionDeconnexion} className="hidden" />
      </div>
    </header>
  )
}
