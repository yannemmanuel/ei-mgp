import Link from 'next/link'
import { exigerUtilisateur } from '@/server/auth'
import { BarreLaterale } from '@/components/layout/barre-laterale'
import { EnTete } from '@/components/layout/en-tete'
import { navigationPour } from '@/components/layout/navigation'
import { prisma } from '@/lib/prisma'
import { nombreNonLues, notificationsRecentes } from '@/server/services/notification/boite'
import { seDeconnecter } from './actions'

/**
 * Coquille du back-office. `exigerUtilisateur()` protège ici l'ensemble du groupe de routes,
 * mais chaque page conserve SA propre vérification de permission : ce layout garantit
 * l'authentification, jamais l'autorisation fine.
 */
export default async function LayoutApplication({ children }: LayoutProps<'/'>) {
  const utilisateur = await exigerUtilisateur()
  const sections = navigationPour(utilisateur)

  const [profil, notifications, nonLues] = await Promise.all([
    prisma.users.findUnique({ where: { id: utilisateur.id }, select: { name: true } }),
    notificationsRecentes(utilisateur.id),
    nombreNonLues(utilisateur.id),
  ])

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              EI
            </span>
            <span className="text-label uppercase tracking-wide text-secondary-500">
              Digitalisation EI / MGP
            </span>
          </Link>
        </div>
        <BarreLaterale sections={sections} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <EnTete
          nom={profil?.name ?? ''}
          roles={utilisateur.roles}
          sections={sections}
          actionDeconnexion={seDeconnecter}
          notifications={notifications}
          nonLues={nonLues}
        />
        <main className="flex-1 bg-muted/40 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
