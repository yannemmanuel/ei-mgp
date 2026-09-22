import type { Metadata } from 'next'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { listerListePlate } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import {
  actionDeplacerLieu,
  actionDeplacerVille,
  actionEnregistrerLieu,
  actionEnregistrerVille,
  actionSupprimerLieu,
  actionSupprimerVille,
} from '../actions'

/** Les deux listes reçoivent les mêmes trois actions, à la liste visée près. */
type Action = (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>

export const metadata: Metadata = { title: 'Administration — Listes des formulaires' }
export const dynamic = 'force-dynamic'

type EtatFormulaire = { erreur?: string; succes?: string }

/**
 * Lieux et villes (ADM3, ADM4).
 *
 * Deux listes de la même forme — un libellé, un état — réunies sur un seul écran.
 * Deux entrées de plus dans le sommaire de l'administration pour deux tableaux de quelques
 * lignes auraient encombré la navigation sans rien apporter.
 *
 * ⚠️ LES TRANCHES D'ANCIENNETÉ ONT QUITTÉ CET ÉCRAN le 2026-09-22 (ADM5). Cinq paliers d'années
 * ne dépendent ni du site, ni de la direction, ni de l'organisation : ce qui ne varie pas ne
 * gagne rien à être paramétrable. Ils sont figés dans `TRANCHES_ANCIENNETE`, où ils deviennent
 * une énumération que la validation refuse à la porte.
 *
 * ⚠️ LA VILLE, ELLE, RESTE ICI et c'est délibéré : la liste des localités riveraines n'est pas
 * connue d'avance, et doit pouvoir s'allonger sans déploiement.
 *
 * Une valeur CITÉE par un dossier ne se supprime pas : elle se désactive, et les déclarations
 * qui l'ont retenue gardent leur sens.
 */
export default async function PageListesFormulaires() {
  await exigerPermission('referentiels.categories.manage')

  const [lieux, villes] = await Promise.all([listerListePlate('lieu'), listerListePlate('ville')])

  return (
    <div className="space-y-8">
      <EnTetePage
        titre="Listes des formulaires"
        lede="Les choix proposés au déclarant. Classés par ordre alphabétique, sauf si les flèches en décident autrement."
        mailles={[
          { libelle: 'Administration', href: '/administration' },
          { libelle: 'Listes des formulaires' },
        ]}
      />

      <Liste
        titre="Lieux"
        description="Lieux proposés dans le formulaire d’évènement indésirable."
        singulier="un lieu"
        lignes={lieux}
        action={actionEnregistrerLieu}
        actionDeplacer={actionDeplacerLieu}
        actionSupprimer={actionSupprimerLieu}
      />

      <Liste
        titre="Villes"
        description="Villes proposées dans le formulaire de plainte des riverains."
        singulier="une ville"
        lignes={villes}
        action={actionEnregistrerVille}
        actionDeplacer={actionDeplacerVille}
        actionSupprimer={actionSupprimerVille}
      />
    </div>
  )
}

function Liste({
  titre,
  description,
  singulier,
  lignes,
  action,
  actionDeplacer,
  actionSupprimer,
}: {
  titre: string
  description: string
  singulier: string
  lignes: Awaited<ReturnType<typeof listerListePlate>>
  action: Action
  actionDeplacer: Action
  actionSupprimer: Action
}) {
  return (
    <EditeurReferentiel
      titre={titre}
      description={description}
      colonnes={['Libellé', 'État']}
      lignes={lignes.map((l) => ({
        id: String(l.id),
        cellules: [
          l.libelle,
          { badge: l.actif ? 'Actif' : 'Inactif', variant: l.actif ? 'default' : 'secondary' },
        ],
        valeurs: { libelle: l.libelle, actif: l.actif },
      }))}
      champs={[
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={action}
      actionDeplacer={actionDeplacer}
      actionSupprimer={actionSupprimer}
      creationPossible
      libelleCreation={`Ajouter ${singulier}`}
    />
  )
}
