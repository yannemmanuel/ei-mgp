import type { Metadata } from 'next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { exigerPermission } from '@/server/auth'
import { listerDirections, listerSites } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionEnregistrerDirection } from '../actions'

export const metadata: Metadata = { title: 'Administration — Directions' }
export const dynamic = 'force-dynamic'

/**
 * Directions et leur site de rattachement.
 *
 * Ce rattachement décide de l'acheminement : le déclarant choisit une direction, le dossier en
 * reçoit le site, et le secrétaire CSST de ce site le voit. Une direction orpheline produit donc
 * des dossiers que seuls les rôles transverses aperçoivent — d'où l'alerte en tête d'écran, qui
 * vaut mieux qu'un référentiel incomplet découvert par l'absence de dossiers.
 */
export default async function PageDirections() {
  await exigerPermission('referentiels.sites.manage')

  const [directions, sites] = await Promise.all([listerDirections(), listerSites()])
  const orphelines = directions.filter((d) => d.site_id === null && d.actif)

  return (
    <div className="space-y-4">
      {orphelines.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {/* Le pluriel est calculé en UNE expression : coupé sur deux lignes par le
                formatage, JSX insère une espace entre « direction » et « s ». */}
            <p className="font-medium">
              {orphelines.length > 1
                ? `${orphelines.length} directions sans site de rattachement.`
                : '1 direction sans site de rattachement.'}
            </p>
            <p className="mt-1 text-caption">
              Une déclaration visant {orphelines.length > 1 ? 'ces directions' : 'cette direction'}{' '}
              produit un dossier sans site : aucun secrétaire habilité par site ne le verra, seuls
              les rôles transverses y auront accès.{' '}
              {orphelines.map((d) => d.libelle).join(', ')}.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <EditeurReferentiel
        titre="Directions"
        description="Un site regroupe une ou plusieurs directions. Le déclarant choisit la direction concernée ; le site du dossier en découle, et avec lui le secrétaire qui le recevra."
        colonnes={['Code', 'Libellé', 'Site', 'État']}
        lignes={directions.map((d) => ({
          id: String(d.id),
          cellules: [
            d.code,
            d.libelle,
            d.sites?.libelle ??
              ({ badge: 'Aucun site', variant: 'destructive' } as const),
            { badge: d.actif ? 'Actif' : 'Inactif', variant: d.actif ? 'default' : 'secondary' },
          ],
          valeurs: {
            code: d.code,
            libelle: d.libelle,
            siteId: d.site_id === null ? '' : String(d.site_id),
            actif: d.actif,
          },
        }))}
        champs={[
          { type: 'texte', nom: 'code', libelle: 'Code', requis: true, max: 100 },
          { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
          {
            type: 'liste',
            nom: 'siteId',
            libelle: 'Site de rattachement',
            vide: '— Aucun (dossiers invisibles des secrétaires) —',
            options: sites.map((s) => ({ valeur: String(s.id), libelle: s.libelle })),
          },
          { type: 'booleen', nom: 'actif', libelle: 'Actif' },
        ]}
        action={actionEnregistrerDirection}
        creationPossible
        libelleCreation="Ajouter une direction"
      />
    </div>
  )
}
