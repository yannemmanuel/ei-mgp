'use client'

import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  actionMarquerNotificationLue,
  actionToutMarquerLu,
} from '@/app/(app)/notifications-actions'
import type { NotificationVue } from '@/server/services/notification/boite'

type Props = {
  notifications: NotificationVue[]
  nonLues: number
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export function ClocheNotifications({ notifications, nonLues }: Props) {
  const [ouvert, setOuvert] = useState(false)
  const [, demarrer] = useTransition()
  const routeur = useRouter()

  const rafraichir = (action: () => Promise<void>) => {
    demarrer(async () => {
      await action()
      // Le layout est rendu côté serveur : c'est lui qui détient le compteur, on le redemande
      // plutôt que d'en tenir une copie locale qui divergerait.
      routeur.refresh()
    })
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={nonLues > 0 ? `Notifications (${nonLues} non lues)` : 'Notifications'}
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {nonLues > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white">
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </Button>

      {ouvert && (
        <>
          {/* Capte le clic extérieur sans dépendre d'un écouteur global. */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setOuvert(false)}
          />

          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-label font-medium text-secondary-900">Notifications</h2>
              {nonLues > 0 && (
                <button
                  type="button"
                  onClick={() => rafraichir(actionToutMarquerLu)}
                  className="text-caption font-medium text-primary-700 hover:underline"
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Aucune notification. Vous êtes à jour.
                </p>
              )}

              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => rafraichir(() => actionMarquerNotificationLue(n.id))}
                  className="flex w-full items-start gap-2.5 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lue ? 'bg-transparent' : 'bg-primary-600'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-secondary-900">
                      {n.objet}
                    </span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {n.corps}
                    </span>
                    <span className="mt-0.5 block text-caption text-muted-foreground">
                      {dateFr(n.recueLe)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
