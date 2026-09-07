import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import {
  EFFETS_CIRCUIT,
  LIBELLES_EFFET,
  listerGravites,
} from '@/server/services/administration/gravites'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionModifierGravite } from '../actions'

export const metadata: Metadata = { title: 'Administration — Niveaux de gravité' }
export const dynamic = 'force-dynamic'

export default async function PageGravites() {
  await exigerPermission('referentiels.gravites.manage')

  const gravites = await listerGravites()

  return (
    <EditeurReferentiel
      titre="Niveaux de gravité"
      description="Le niveau (1 à 4) et le code ne sont pas modifiables : ils ordonnent l’échelle et sont référencés par les dossiers déjà classés. L’effet de circuit, lui, commande l’alerte immédiate de la Direction (RG-08)."
      colonnes={['Niveau', 'Code', 'Libellé', 'Couleur', 'Circuit', 'État']}
      lignes={gravites.map((g) => ({
        id: String(g.id),
        cellules: [
          String(g.niveau),
          g.code,
          g.libelle,
          g.couleur ?? '—',
          badgeCircuit(g.effet_circuit),
          { badge: g.actif ? 'Actif' : 'Inactif', variant: g.actif ? 'default' : 'secondary' },
        ],
        valeurs: {
          libelle: g.libelle,
          couleur: g.couleur ?? '',
          effetCircuit: g.effet_circuit,
          actif: g.actif,
        },
      }))}
      champs={[
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        {
          type: 'texte',
          nom: 'couleur',
          libelle: 'Couleur (hexadécimal, ex. #d4380d)',
          max: 7,
        },
        {
          type: 'liste',
          nom: 'effetCircuit',
          libelle: 'Effet sur le circuit',
          requis: true,
          options: EFFETS_CIRCUIT.map((e) => ({ valeur: e, libelle: LIBELLES_EFFET[e] })),
        },
        { type: 'booleen', nom: 'actif', libelle: 'Proposé dans les formulaires' },
      ]}
      action={actionModifierGravite}
      // L'échelle compte quatre degrés fixés par le CDC : en ajouter un déplacerait le sens des
      // dossiers déjà classés.
      creationPossible={false}
    />
  )
}

/** Trois effets possibles : les confondre masquerait le déclencheur du circuit accéléré. */
function badgeCircuit(effet: string) {
  if (effet === 'accelere') return { badge: 'Accéléré', variant: 'destructive' as const }
  if (effet === 'priorisation') return { badge: 'Priorisé', variant: 'default' as const }

  return { badge: 'Standard', variant: 'secondary' as const }
}
