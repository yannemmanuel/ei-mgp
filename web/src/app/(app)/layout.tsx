import Link from 'next/link'
import { exigerUtilisateur } from '@/server/auth'
import { LIBELLES_ROLE } from '@/server/authz'
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
 *
 * La coquille ne se recompose pas d'une page à l'autre — c'est ce qui rend la navigation
 * instantanée : seule la zone `main` est remplacée, et un `loading.tsx` en tient la place le
 * temps de la lecture en base.
 */
export default async function LayoutApplication({ children }: LayoutProps<'/'>) {
  const utilisateur = await exigerUtilisateur()
  const sections = navigationPour(utilisateur)

  const [profil, notifications, nonLues, libellesRoles] = await Promise.all([
    prisma.users.findUnique({ where: { id: utilisateur.id }, select: { name: true } }),
    notificationsRecentes(utilisateur.id),
    nombreNonLues(utilisateur.id),
    // Les libellés viennent de la base, où ils sont administrables : renommer un rôle dans
    // `/administration/habilitations` doit se voir ici sans redéploiement.
    prisma.roles.findMany({
      where: { name: { in: [...utilisateur.roles] } },
      select: { name: true, libelle: true },
    }),
  ])

  const libelleDuRole = new Map(libellesRoles.map((r) => [r.name, r.libelle]))

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                EI
              </span>
              <span className="text-label uppercase tracking-wide text-secondary-500">
                Digitalisation EI / MGP
              </span>
            </Link>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <BarreLaterale sections={sections} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <EnTete
          nom={profil?.name ?? ''}
          // Les identifiants techniques restent côté serveur : la barre affiche « Administrateur
          // digital », pas `administrateur_digital`. Le catalogue du code sert de repli si le
          // rôle manque en base.
          roles={utilisateur.roles.map(
            (role) => libelleDuRole.get(role) ?? LIBELLES_ROLE[role] ?? role
          )}
          sections={sections}
          actionDeconnexion={seDeconnecter}
          notifications={notifications}
          nonLues={nonLues}
        />
        <main className="flex-1 bg-muted/40">
          {/* Largeur bornée : au-delà, une ligne de texte traverse tout l'écran et l'œil perd la
              ligne suivante. Les tableaux larges défilent dans leur propre conteneur. */}
          <div className="mx-auto max-w-[1600px] p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
