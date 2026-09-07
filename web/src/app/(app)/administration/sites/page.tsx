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
      description="Sites d’exploitation, utilisés au dépôt d’une déclaration et comme filtre de reporting."
      colonnes={['Code', 'Libellé', 'État']}
      lignes={sites.map((s) => ({
        id: String(s.id),
        cellules: [
          s.code,
          s.libelle,
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
