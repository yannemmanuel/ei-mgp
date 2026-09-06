import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { exigerUtilisateur } from '@/server/auth'
import { peutVoirListeDossiers } from '@/server/authz'
import { listerDossiers, referentielsFiltres } from '@/server/services/dossier/liste'
import { FiltresDossiers } from './filtres'

export const metadata: Metadata = { title: 'Dossiers' }

const dateFr = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(d) : '—'

/** Couleur de badge par niveau de gravité (échelle 1-4, CDC §11.1). */
function varianteGravite(niveau: number): 'secondary' | 'default' | 'destructive' {
  if (niveau >= 4) return 'destructive'
  if (niveau === 3) return 'default'
  return 'secondary'
}

export default async function PageDossiers({ searchParams }: PageProps<'/dossiers'>) {
  const utilisateur = await exigerUtilisateur()

  // Vérification serveur, indépendante du masquage du lien dans la navigation.
  if (!peutVoirListeDossiers(utilisateur)) {
    redirect('/acces-refuse')
  }

  const params = await searchParams
  const lire = (cle: string) => {
    const v = params[cle]
    return typeof v === 'string' && v !== '' ? v : undefined
  }

  const filtres = {
    parcoursId: lire('parcoursId'),
    categorieId: lire('categorieId'),
    statutId: lire('statutId'),
    niveauGraviteId: lire('niveauGraviteId'),
    periodeDebut: lire('periodeDebut'),
    periodeFin: lire('periodeFin'),
    assigneAMoi: lire('assigneAMoi') === '1',
  }

  const page = Number(lire('page') ?? '1')
  const [resultat, referentiels] = await Promise.all([
    listerDossiers(utilisateur, filtres, Number.isFinite(page) && page > 0 ? page : 1),
    referentielsFiltres(filtres.parcoursId),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-h1 text-secondary-900">Dossiers</h1>
        <p className="text-caption text-muted-foreground">
          {resultat.total} dossier{resultat.total > 1 ? 's' : ''}
        </p>
      </div>

      <FiltresDossiers referentiels={referentiels} valeurs={filtres} />

      <Card className="overflow-hidden p-0">
        {resultat.dossiers.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-secondary-300" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucun dossier ne correspond à ces critères.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Parcours</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Gravité</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Reçu le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultat.dossiers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link
                        href={`/dossiers/${d.id}`}
                        className="font-mono text-sm text-primary-700 underline-offset-2 hover:underline"
                      >
                        {d.reference}
                      </Link>
                      {d.is_anonymous && (
                        <Badge variant="secondary" className="ml-2 font-normal">
                          Anonyme
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{d.parcours.libelle}</TableCell>
                    <TableCell className="text-sm">{d.categories.libelle}</TableCell>
                    <TableCell>
                      <Badge variant={varianteGravite(d.niveaux_gravite.niveau)} className="font-normal">
                        {d.niveaux_gravite.libelle}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{d.statuts_dossier.libelle_interne}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateFr(d.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {resultat.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {resultat.page} sur {resultat.pages}
          </span>
          <div className="flex gap-2">
            {resultat.page > 1 && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={{ pathname: '/dossiers', query: { ...params, page: resultat.page - 1 } }}
                  />
                }
              >
                Précédent
              </Button>
            )}
            {resultat.page < resultat.pages && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={{ pathname: '/dossiers', query: { ...params, page: resultat.page + 1 } }}
                  />
                }
              >
                Suivant
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
