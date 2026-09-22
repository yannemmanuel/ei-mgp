import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { chargerParametrageFamillesRisque } from '@/server/services/administration/familles-risque'
import { EditeurReferentiel } from '../editeur-referentiel'
import {
  actionDeplacerFamille,
  actionModifierFamille,
  actionSupprimerFamille,
} from './actions'
import { PanneauTypes } from './panneau-types'

export const metadata: Metadata = { title: 'Administration — Familles de risque' }
export const dynamic = 'force-dynamic'

/**
 * Les familles de risque : la liste elle-même, et les types qui la demandent.
 *
 * ⚠️ DEUX RÉGLAGES DE NATURE DIFFÉRENTE, sur le même écran, et c'est voulu. La table dit CE QU'ON
 * PEUT CHOISIR ; le panneau du bas dit OÙ LA QUESTION EST POSÉE. Les séparer en deux écrans aurait
 * laissé activer une liste sans savoir si quelqu'un la voit, ou cocher un type sans savoir ce
 * qu'il propose — et c'est précisément le couple qui produit la panne silencieuse : un type qui
 * demande une famille alors qu'aucune n'est active.
 *
 * L'éditeur de référentiel est celui, commun, des cinq autres écrans : il apporte la confirmation
 * de suppression, le déplacement de rang et le formulaire d'édition, tous déjà éprouvés. Il ne
 * décide rien — les actions qu'on lui passe revérifient la permission.
 */
export default async function PageFamillesRisque() {
  await exigerPermission('referentiels.categories.manage')

  const { types, familles } = await chargerParametrageFamillesRisque()

  return (
    <div className="space-y-6">
      <EditeurReferentiel
        titre="Familles de risque"
        description="Ce que les traitants peuvent choisir pour rattacher une déclaration, une fois instruite."
        colonnes={['Rang', 'Code', 'Libellé', 'Dossiers', 'État']}
        lignes={familles.map((f, index) => ({
          id: f.id,
          cellules: [
            String(index + 1),
            f.code,
            f.libelle,
            /*
              Le nombre de dossiers n'est pas décoratif : c'est lui qui dit si la famille est
              supprimable. Le service refuse d'effacer une ligne citée — le voir avant de cliquer
              évite de découvrir le refus après coup.
            */
            f.dossiers === 0 ? '—' : String(f.dossiers),
            { badge: f.actif ? 'Proposée' : 'Retirée', variant: f.actif ? 'default' : 'secondary' },
          ],
          valeurs: { libelle: f.libelle, actif: f.actif },
        }))}
        champs={[
          { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
          { type: 'booleen', nom: 'actif', libelle: 'Proposée aux traitants' },
        ]}
        action={actionModifierFamille}
        creationPossible
        libelleCreation="Ajouter une famille"
        messageVide="Aucune famille : les traitants n’auraient rien à choisir."
        actionDeplacer={actionDeplacerFamille}
        actionSupprimer={actionSupprimerFamille}
      />

      {/*
        ⚠️ LE CODE TECHNIQUE N'EST PAS ÉDITABLE, et la table le montre quand même.

        Il est dérivé du libellé à la création et ne bouge plus : c'est la clé de rapprochement du
        journal d'audit, qui est en ajout seul. Le cacher ferait croire qu'il n'existe pas ; le
        rendre modifiable ferait mentir les lignes déjà écrites.
      */}
      <PanneauTypes
        types={types.map((t) => ({
          code: t.code,
          libelle: t.libelle,
          actif: t.actif,
          qualifieLaFamille: t.qualifieLaFamille,
          dossiersQualifies: t.dossiersQualifies,
        }))}
        famillesActives={familles.filter((f) => f.actif).length}
      />
    </div>
  )
}
