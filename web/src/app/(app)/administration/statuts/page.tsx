import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { listerStatuts } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionModifierStatut } from '../actions'

export const metadata: Metadata = { title: 'Administration — Statuts' }
export const dynamic = 'force-dynamic'

export default async function PageStatuts() {
  await exigerPermission('referentiels.statuts.manage')

  const statuts = await listerStatuts()

  return (
    <EditeurReferentiel
      titre="Statuts"
      description="Le libellé affiché est celui que voit le déclarant sur la page de suivi (RGI-10) : le modifier ici le modifie partout, immédiatement."
      colonnes={['Code', 'Libellé interne', 'Libellé affiché', 'Ordre', 'Terminal']}
      lignes={statuts.map((s) => ({
        id: String(s.id),
        cellules: [
          s.code,
          s.libelle_interne,
          s.libelle_affiche,
          String(s.ordre),
          s.is_terminal ? 'Oui' : '—',
        ],
        valeurs: {
          libelleInterne: s.libelle_interne,
          libelleAffiche: s.libelle_affiche,
          ordre: String(s.ordre),
        },
      }))}
      champs={[
        { type: 'texte', nom: 'libelleInterne', libelle: 'Libellé interne', requis: true, max: 255 },
        { type: 'texte', nom: 'libelleAffiche', libelle: 'Libellé affiché au déclarant', requis: true, max: 255 },
        { type: 'nombre', nom: 'ordre', libelle: 'Ordre', requis: true, min: 1 },
      ]}
      action={actionModifierStatut}
      // `code` est la colonne pivot du graphe de transitions : ajouter ou retirer un statut le
      // casserait. Seuls les libellés et l'ordre sont modifiables.
      creationPossible={false}
    />
  )
}
