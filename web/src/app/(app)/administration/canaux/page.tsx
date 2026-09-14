import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { listerCanaux } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionSupprimerCanal } from '../suppressions-actions'
import { actionModifierCanal } from '../actions'

export const metadata: Metadata = { title: 'Administration — Canaux de captage' }
export const dynamic = 'force-dynamic'

export default async function PageCanaux() {
  await exigerPermission('canaux.manage')

  const canaux = await listerCanaux()

  return (
    <EditeurReferentiel
      titre="Canaux de captage"
      description="Voies par lesquelles une déclaration parvient au dispositif."
      colonnes={['Code', 'Libellé', 'État']}
      lignes={canaux.map((c) => ({
        id: String(c.id),
        cellules: [
          c.code,
          c.libelle,
          { badge: c.actif ? 'Actif' : 'Inactif', variant: c.actif ? 'default' : 'secondary' },
        ],
        valeurs: { libelle: c.libelle, actif: c.actif },
      }))}
      champs={[
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={actionModifierCanal}
      // Les 4 codes de canaux sont fixés par le CDC §6.7 : seuls libellé et activation varient.
      actionSupprimer={actionSupprimerCanal}
      creationPossible={false}
    />
  )
}
