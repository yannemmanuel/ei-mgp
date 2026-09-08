import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { PARCOURS } from '@/server/services/declaration/parcours-config'

export const metadata: Metadata = { title: 'Saisie relais' }
export const dynamic = 'force-dynamic'

/**
 * EX-DEC-10 : point d'entrée de la saisie relais.
 *
 * Réservé aux comptes porteurs de `dossiers.create` — dont le rôle `agent_relais`, qui ne
 * détient que cette permission et n'a accès à aucun dossier.
 */
export default async function PageRelais() {
  await exigerPermission('dossiers.create')

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Saisie relais"
        lede="Pour saisir une déclaration reçue autrement : ligne verte, boîte à suggestions ou de vive voix. Elle suit ensuite le même circuit que les autres."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.values(PARCOURS).map((parcours) => (
          <Link key={parcours.code} href={`/relais/${parcours.code}`} className="block">
            <Card className="h-full p-5 transition-colors hover:border-primary-600">
              <p className="text-h3 text-secondary-900">{parcours.libelle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{parcours.titre}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
