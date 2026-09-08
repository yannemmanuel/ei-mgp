import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import { aPermission, type Permission } from '@/server/authz'

export const metadata: Metadata = { title: 'Administration' }
export const dynamic = 'force-dynamic'

/**
 * Sommaire de l'administration — port de la route `administration.index` (Laravel).
 *
 * Chaque entrée n'apparaît que si la permission correspondante est détenue, et la page cible
 * refait sa propre vérification : ce sommaire ne fait que ne pas proposer une impasse.
 */
type Entree = {
  libelle: string
  href: string
  permission: Permission
  description: string
  compter: () => Promise<number>
  unite: string
}

const ENTREES: Entree[] = [
  {
    libelle: 'Comptes',
    href: '/administration/utilisateurs',
    permission: 'users.manage',
    description: 'Comptes, rôles et rattachements.',
    compter: () => prisma.users.count(),
    unite: 'compte(s)',
  },
  {
    libelle: 'Habilitations',
    href: '/administration/habilitations',
    permission: 'roles.manage',
    description: 'Qui a le droit de faire quoi. Lecture seule — la matrice est décidée dans le code.',
    compter: () => prisma.roles.count(),
    unite: 'rôle(s)',
  },
  {
    libelle: 'Catégories',
    href: '/administration/categories',
    permission: 'referentiels.categories.manage',
    description: 'Catégories de déclaration, par parcours.',
    compter: () => prisma.categories.count(),
    unite: 'catégorie(s)',
  },
  {
    libelle: 'Statuts',
    href: '/administration/statuts',
    permission: 'referentiels.statuts.manage',
    description: 'Libellés internes et libellés montrés au déclarant.',
    compter: () => prisma.statuts_dossier.count(),
    unite: 'statut(s)',
  },
  {
    libelle: 'Délais de traitement',
    href: '/administration/delais',
    permission: 'referentiels.delais.manage',
    description: 'Délais par étape et par parcours, et leur validation métier.',
    compter: () => prisma.sla_delais.count({ where: { est_valide_metier: true } }),
    unite: 'délai(s) validé(s)',
  },
  {
    libelle: 'Niveaux de gravité',
    href: '/administration/gravites',
    permission: 'referentiels.gravites.manage',
    description: 'Échelle de gravité et déclenchement du circuit accéléré.',
    compter: () => prisma.niveaux_gravite.count({ where: { actif: true } }),
    unite: 'niveau(x) actif(s)',
  },
  {
    libelle: 'Sites',
    href: '/administration/sites',
    permission: 'referentiels.sites.manage',
    description: 'Sites d’exploitation.',
    compter: () => prisma.sites.count(),
    unite: 'site(s)',
  },
  {
    libelle: 'Canaux de captage',
    href: '/administration/canaux',
    permission: 'canaux.manage',
    description: 'Voies par lesquelles une déclaration parvient.',
    compter: () => prisma.canaux_captage.count(),
    unite: 'canal(aux)',
  },
  {
    libelle: 'Gabarits de notification',
    href: '/administration/notifications',
    permission: 'notifications.templates.manage',
    description: 'Objets, corps et destinataires supplémentaires.',
    compter: () => prisma.notification_templates.count(),
    unite: 'gabarit(s)',
  },
  {
    libelle: 'QR codes',
    href: '/administration/qr-codes',
    permission: 'qrcodes.manage',
    description: 'Supports physiques de déclaration.',
    compter: () => prisma.qr_codes.count(),
    unite: 'code(s)',
  },
]

export default async function PageAdministration() {
  const utilisateur = await exigerUtilisateur()

  const accessibles = ENTREES.filter((e) => aPermission(utilisateur, e.permission))
  const compteurs = await Promise.all(accessibles.map((e) => e.compter()))

  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-secondary-900">Administration</h1>

      {accessibles.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Aucune console d’administration n’est accessible à votre rôle.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accessibles.map((entree, index) => (
            <Link key={entree.href} href={entree.href} className="block">
              <Card className="h-full p-5 transition-colors hover:border-primary-600">
                <p className="text-h3 text-secondary-900">{entree.libelle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{entree.description}</p>
                <p className="mt-3 text-caption text-secondary-600">
                  {compteurs[index]} {entree.unite}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
