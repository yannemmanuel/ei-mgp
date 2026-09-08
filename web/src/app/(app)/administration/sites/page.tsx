import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { listerSites } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionEnregistrerSite } from '../actions'

export const metadata: Metadata = { title: 'Administration — Sites' }
export const dynamic = 'force-dynamic'

export default async function PageSites() {
  await exigerPermission('referentiels.sites.manage')

  const sites = await listerSites()

  return (
    <EditeurReferentiel
      titre="Sites"
      description="Un site regroupe une ou plusieurs directions, et c’est par lui que sont habilités les secrétaires. Un site ne se supprime pas : il se désactive — et pas tant que des directions y sont rattachées."
      colonnes={['Code', 'Libellé', 'Directions', 'Comptes', 'État']}
      lignes={sites.map((s) => ({
        id: String(s.id),
        cellules: [
          s.code,
          s.libelle,
          // Ce qui dépend du site, visible avant de le désactiver plutôt qu'après.
          String(s._count.directions),
          String(s._count.users),
          { badge: s.actif ? 'Actif' : 'Inactif', variant: s.actif ? 'default' : 'secondary' },
        ],
        valeurs: { code: s.code, libelle: s.libelle, actif: s.actif },
      }))}
      champs={[
        { type: 'texte', nom: 'code', libelle: 'Code', requis: true, max: 100 },
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={actionEnregistrerSite}
      creationPossible
      libelleCreation="Ajouter un site"
    />
  )
}
