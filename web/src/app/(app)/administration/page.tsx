import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import { aPermission, type Permission } from '@/server/authz'

export const metadata: Metadata = { title: 'Administration' }
export const dynamic = 'force-dynamic'

/**
 * Sommaire de l'administration.
 *
 * Chaque entrée n'apparaît que si la permission correspondante est détenue, et la page cible
 * refait sa propre vérification : ce sommaire ne fait que ne pas proposer une impasse.
 *
 * Les dix consoles étaient présentées à plat, dans l'ordre où elles avaient été écrites. On les
 * regroupe ici par nature de décision — qui accède, comment un dossier progresse, comment il se
 * nomme, ce qui part vers le déclarant. Un regroupement de trois ou quatre entrées se parcourt
 * d'un regard, une grille de dix se lit ligne à ligne.
 */
type Entree = {
  libelle: string
  href: string
  permission: Permission
  description: string
  compter: () => Promise<number>
  /** Unité au singulier puis au pluriel — jamais de « compte(s) ». */
  unite: readonly [string, string]
}

type Groupe = { titre: string; entrees: Entree[] }

const GROUPES: Groupe[] = [
  {
    titre: 'Accès et droits',
    entrees: [
      {
        libelle: 'Comptes',
        href: '/administration/utilisateurs',
        permission: 'users.manage',
        description: 'Comptes, rôles et rattachements.',
        compter: () => prisma.users.count(),
        unite: ['compte', 'comptes'],
      },
      {
        libelle: 'Habilitations',
        href: '/administration/habilitations',
        permission: 'roles.manage',
        description: 'Ce que chaque rôle a le droit de faire. Modifiable, avec journalisation.',
        compter: () => prisma.roles.count(),
        unite: ['rôle', 'rôles'],
      },
    ],
  },
  {
    titre: 'Traitement des dossiers',
    entrees: [
      {
        libelle: 'Statuts',
        href: '/administration/statuts',
        permission: 'referentiels.statuts.manage',
        description: 'Libellés internes et libellés montrés au déclarant.',
        compter: () => prisma.statuts_dossier.count(),
        unite: ['statut', 'statuts'],
      },
      {
        libelle: 'Délais de traitement',
        href: '/administration/delais',
        permission: 'referentiels.delais.manage',
        description: 'Délais par étape et par parcours, et leur validation métier.',
        compter: () => prisma.sla_delais.count({ where: { est_valide_metier: true } }),
        unite: ['délai validé', 'délais validés'],
      },
      {
        libelle: 'Niveaux de gravité',
        href: '/administration/gravites',
        permission: 'referentiels.gravites.manage',
        description: 'Échelle de gravité et déclenchement du circuit accéléré.',
        compter: () => prisma.niveaux_gravite.count({ where: { actif: true } }),
        unite: ['niveau actif', 'niveaux actifs'],
      },
    ],
  },
  {
    titre: 'Nomenclatures',
    entrees: [
      {
        libelle: 'Catégories',
        href: '/administration/categories',
        permission: 'referentiels.categories.manage',
        description: 'Catégories de déclaration, par parcours.',
        compter: () => prisma.categories.count(),
        unite: ['catégorie', 'catégories'],
      },
      {
        libelle: 'Sites et directions',
        href: '/administration/organisation',
        permission: 'referentiels.sites.manage',
        description:
          'Un site regroupe plusieurs directions. Ce rattachement décide du site d’un dossier, donc de qui le reçoit.',
        // Ce sont les directions ORPHELINES qui méritent l'attention : leurs dossiers
        // n'atteignent aucun secrétaire habilité par site. Compter les sites n'appellerait
        // aucune action.
        compter: () => prisma.directions.count({ where: { actif: true, site_id: null } }),
        unite: ['direction sans site', 'directions sans site'],
      },
      {
        libelle: 'Canaux de captage',
        href: '/administration/canaux',
        permission: 'canaux.manage',
        description: 'Voies par lesquelles une déclaration parvient.',
        compter: () => prisma.canaux_captage.count(),
        unite: ['canal', 'canaux'],
      },
    ],
  },
  {
    titre: 'Vers le déclarant',
    entrees: [
      {
        libelle: 'Gabarits de notification',
        href: '/administration/notifications',
        permission: 'notifications.templates.manage',
        description: 'Objets, corps et destinataires supplémentaires.',
        compter: () => prisma.notification_templates.count(),
        unite: ['gabarit', 'gabarits'],
      },
      {
        libelle: 'QR codes',
        href: '/administration/qr-codes',
        permission: 'qrcodes.manage',
        description: 'Supports physiques de déclaration.',
        compter: () => prisma.qr_codes.count(),
        unite: ['code', 'codes'],
      },
    ],
  },
]

export default async function PageAdministration() {
  const utilisateur = await exigerUtilisateur()

  const groupes = GROUPES.map((groupe) => ({
    titre: groupe.titre,
    entrees: groupe.entrees.filter((entree) => aPermission(utilisateur, entree.permission)),
  })).filter((groupe) => groupe.entrees.length > 0)

  const accessibles = groupes.flatMap((groupe) => groupe.entrees)
  const compteurs = new Map(
    await Promise.all(
      accessibles.map(async (entree) => [entree.href, await entree.compter()] as const)
    )
  )

  return (
    <div className="space-y-8">
      <EnTetePage
        titre="Administration"
        lede="Le paramétrage de l’application. Rien ne s’y supprime : ce qui n’a plus lieu d’être se désactive."
      />

      {accessibles.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Aucune console d’administration n’est accessible à votre rôle.
          </p>
        </Card>
      ) : (
        groupes.map((groupe) => (
          <section key={groupe.titre} className="space-y-3">
            <h2 className="text-label uppercase tracking-wide text-secondary-400">
              {groupe.titre}
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groupe.entrees.map((entree) => {
                const nombre = compteurs.get(entree.href) ?? 0

                return (
                  <Link
                    key={entree.href}
                    href={entree.href}
                    className="group block rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Card className="h-full p-4 transition-shadow group-hover:ring-primary-300 group-hover:shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-h3 text-secondary-900">{entree.libelle}</p>
                        <ChevronRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-secondary-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600"
                          aria-hidden
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{entree.description}</p>
                      <p className="mt-3 text-caption text-secondary-600">
                        {nombre} {nombre > 1 ? entree.unite[1] : entree.unite[0]}
                      </p>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
