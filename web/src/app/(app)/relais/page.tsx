import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
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
      <div>
        <h1 className="text-h1 text-secondary-900">Saisie relais</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pour transcrire une déclaration reçue hors ligne — ligne verte, boîte à suggestions ou
          échange direct. Le canal d’origine est enregistré, et la déclaration suit ensuite
          exactement le même circuit qu’une déclaration déposée par le déclarant lui-même (RG-13).
        </p>
      </div>

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
