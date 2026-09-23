import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { listerStatuts } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionModifierStatut } from '../actions'
import { actionSupprimerStatut } from '../suppressions-actions'

export const metadata: Metadata = { title: 'Administration — Statuts' }
export const dynamic = 'force-dynamic'

export default async function PageStatuts() {
  await exigerPermission('referentiels.statuts.manage')

  const statuts = await listerStatuts()

  return (
    <EditeurReferentiel
      titre="Statuts"
      description="Le libellé affiché est celui que voit le déclarant. Désactiver un statut le retire des changements d’état proposés, sans déplacer les dossiers qui s’y trouvent."
      colonnes={['Code', 'Libellé interne', 'Libellé affiché', 'Ordre', 'Terminal', 'État']}
      lignes={statuts.map((s) => ({
        id: String(s.id),
        cellules: [
          s.code,
          s.libelle_interne,
          s.libelle_affiche,
          String(s.ordre),
          s.is_terminal ? 'Oui' : '—',
          s.actif
            ? '—'
            : { badge: 'Désactivé', variant: 'destructive' as const },
        ],
        valeurs: {
          libelleInterne: s.libelle_interne,
          libelleAffiche: s.libelle_affiche,
          ordre: String(s.ordre),
          actif: s.actif,
        },
      }))}
      champs={[
        { type: 'texte', nom: 'libelleInterne', libelle: 'Libellé interne', requis: true, max: 255 },
        { type: 'texte', nom: 'libelleAffiche', libelle: 'Libellé affiché au déclarant', requis: true, max: 255 },
        { type: 'nombre', nom: 'ordre', libelle: 'Ordre', requis: true, min: 1 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={actionModifierStatut}
      actionSupprimer={actionSupprimerStatut}
      /*
        ⚠️ Le CODE reste figé, et la création fermée : c'est lui qui relie la ligne au graphe de
        transitions écrit dans le code. Un statut créé ici porterait un code inconnu du workflow,
        n'apparaîtrait dans aucune transition, et serait donc inatteignable.

        La suppression, elle, est ouverte sur décision métier. Elle refuse ce qu'un dossier ou
        l'historique cite — la quasi-totalité des cas — et le tableau de bord signale tout état
        du circuit qui viendrait à manquer.
      */
      creationPossible={false}
    />
  )
}
