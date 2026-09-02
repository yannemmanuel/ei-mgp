import type { Metadata } from 'next'
import { exigerUtilisateur } from '@/server/auth'
import { parcoursAutorises } from '@/server/authz'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Tableau de bord',
}

/**
 * Page d'atterrissage post-connexion — provisoire.
 *
 * Elle ne fait pour l'instant que restituer la chaine session -> autorisation. Le tableau de
 * bord reel (EX-REP-01/02, avec sa ramification selon `reporting.view` — DT-31) est construit a
 * l'etape 10.
 */
export default async function PageTableauDeBord() {
  const utilisateur = await exigerUtilisateur()
  const parcours = parcoursAutorises(utilisateur.roles)

  return (
    <div className="space-y-4">
      <h1 className="text-h1 text-secondary-900">Tableau de bord</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Vos acces</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-caption text-muted-foreground">Roles</dt>
              <dd className="text-secondary-900">{utilisateur.roles.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Permissions</dt>
              <dd className="text-secondary-900">{utilisateur.permissions.size}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Parcours accessibles</dt>
              <dd className="text-secondary-900">{parcours.join(', ') || '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
