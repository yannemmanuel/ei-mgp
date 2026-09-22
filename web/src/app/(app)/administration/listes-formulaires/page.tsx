import type { Metadata } from 'next'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { listerListePlate } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import {
  actionDeplacerLieu,
  actionDeplacerTrancheAnciennete,
  actionDeplacerVille,
  actionEnregistrerLieu,
  actionEnregistrerTranche,
  actionEnregistrerVille,
  actionSupprimerLieu,
  actionSupprimerTrancheAnciennete,
  actionSupprimerVille,
} from '../actions'

/** Les trois listes reçoivent les mêmes trois actions, à la liste visée près. */
type Action = (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>

export const metadata: Metadata = { title: 'Administration — Listes des formulaires' }
export const dynamic = 'force-dynamic'

type EtatFormulaire = { erreur?: string; succes?: string }

/**
 * Lieux, villes et tranches d'ancienneté (ADM3, ADM4, ADM5).
 *
 * Trois listes de la même forme — un libellé, un état — réunies sur un seul écran.
 * Trois entrées de plus dans le sommaire de l'administration pour trois tableaux de quelques
 * lignes auraient encombré la navigation sans rien apporter.
 *
 * Aucune valeur ne se supprime : elle se désactive, et les déclarations qui l'ont retenue
 * gardent leur sens.
 */
export default async function PageListesFormulaires() {
  await exigerPermission('referentiels.categories.manage')

  const [lieux, villes, tranches] = await Promise.all([
    listerListePlate('lieu'),
    listerListePlate('ville'),
    listerListePlate('trancheAnciennete'),
  ])

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

      <Liste
        titre="Tranches d’ancienneté"
        description="Tranches proposées dans le formulaire de grief des employés."
        singulier="une tranche"
        lignes={tranches}
        action={actionEnregistrerTranche}
        actionDeplacer={actionDeplacerTrancheAnciennete}
        actionSupprimer={actionSupprimerTrancheAnciennete}
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
