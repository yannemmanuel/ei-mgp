import type { Metadata } from 'next'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { listerListePlate } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import {
  actionEnregistrerLieu,
  actionEnregistrerTranche,
  actionEnregistrerVille,
} from '../actions'

export const metadata: Metadata = { title: 'Administration — Listes des formulaires' }
export const dynamic = 'force-dynamic'

type EtatFormulaire = { erreur?: string; succes?: string }

/**
 * Lieux, villes et tranches d'ancienneté (ADM3, ADM4, ADM5).
 *
 * Trois listes de la même forme — un libellé, un ordre, un état — réunies sur un seul écran.
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
        lede="Les choix proposés au déclarant. Une valeur retirée se désactive, elle ne se supprime pas."
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
      />

      <Liste
        titre="Villes"
        description="Villes proposées dans le formulaire de plainte des riverains."
        singulier="une ville"
        lignes={villes}
        action={actionEnregistrerVille}
      />

      <Liste
        titre="Tranches d’ancienneté"
        description="Tranches proposées dans le formulaire de grief des employés."
        singulier="une tranche"
        lignes={tranches}
        action={actionEnregistrerTranche}
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
}: {
  titre: string
  description: string
  singulier: string
  lignes: Awaited<ReturnType<typeof listerListePlate>>
  action: (etat: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>
}) {
  return (
    <EditeurReferentiel
      titre={titre}
      description={description}
      colonnes={['Libellé', 'Ordre', 'État']}
      lignes={lignes.map((l) => ({
        id: String(l.id),
        cellules: [
          l.libelle,
          String(l.ordre),
          { badge: l.actif ? 'Actif' : 'Inactif', variant: l.actif ? 'default' : 'secondary' },
        ],
        valeurs: { libelle: l.libelle, ordre: String(l.ordre), actif: l.actif },
      }))}
      champs={[
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        { type: 'nombre', nom: 'ordre', libelle: 'Ordre d’affichage', requis: true, min: 1 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={action}
      creationPossible
      libelleCreation={`Ajouter ${singulier}`}
    />
  )
}
