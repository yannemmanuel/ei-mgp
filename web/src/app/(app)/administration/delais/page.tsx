import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import {
  LIBELLES_ETAPE,
  LIBELLES_UNITE,
  UNITES_DELAI,
  listerDelais,
} from '@/server/services/administration/delais'
import type { EtapeDelai } from '@/server/services/dossier/delais'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionModifierDelai } from '../actions'

export const metadata: Metadata = { title: 'Administration — Délais' }
export const dynamic = 'force-dynamic'

export default async function PageDelais() {
  await exigerPermission('referentiels.delais.manage')

  const delais = await listerDelais()

  return (
    <EditeurReferentiel
      titre="Délais de traitement"
      description="Délais maximaux par étape et par parcours (CDC §11.2). Tant qu’un délai n’est pas validé, AUCUNE échéance n’est calculée pour cette étape : ni relance à J-3, ni escalade."
      colonnes={['Parcours', 'Étape', 'Délai', 'Validé', 'Note']}
      lignes={delais.map((d) => ({
        id: String(d.id),
        cellules: [
          d.parcours.libelle,
          LIBELLES_ETAPE[d.etape_code as EtapeDelai] ?? d.etape_code,
          `${d.valeur} ${LIBELLES_UNITE[d.unite as keyof typeof LIBELLES_UNITE] ?? d.unite}`,
          {
            badge: d.est_valide_metier ? 'Validé' : 'Provisoire',
            variant: d.est_valide_metier ? 'default' : 'destructive',
          },
          d.notes ?? '—',
        ],
        valeurs: {
          valeur: String(d.valeur),
          unite: d.unite,
          estValideMetier: d.est_valide_metier,
          notes: d.notes ?? '',
        },
      }))}
      champs={[
        { type: 'nombre', nom: 'valeur', libelle: 'Valeur', requis: true, min: 1 },
        {
          type: 'liste',
          nom: 'unite',
          libelle: 'Unité',
          requis: true,
          options: UNITES_DELAI.map((u) => ({ valeur: u, libelle: LIBELLES_UNITE[u] })),
        },
        {
          type: 'booleen',
          nom: 'estValideMetier',
          libelle: 'Validé par le métier — active le suivi d’échéance',
        },
        {
          type: 'zone',
          nom: 'notes',
          libelle: 'Note',
          aide: 'Contexte de la valeur retenue, à l’usage des personnes qui la reliront.',
        },
      ]}
      action={actionModifierDelai}
      // Le jeu (parcours × étape) est fixé par le graphe de statuts : une ligne supplémentaire ne
      // serait rattachée à aucun statut et resterait sans effet.
      creationPossible={false}
    />
  )
}
