import type { Metadata } from 'next'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { listerCommunes, listerListePlate } from '@/server/services/administration/referentiels'
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
 * Régions et communes (ADM3, ADM4).
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
 * ⚠️ LA COMMUNE RESTE ICI et c'est délibéré : la nomenclature doit pouvoir évoluer sans
 * déploiement, tout en conservant son rattachement explicite à une région.
 *
 * Une valeur CITÉE par un dossier ne se supprime pas : elle se désactive, et les déclarations
 * qui l'ont retenue gardent leur sens.
 */
export default async function PageListesFormulaires() {
  await exigerPermission('referentiels.categories.manage')

  const [lieux, villes] = await Promise.all([listerListePlate('lieu'), listerCommunes()])

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
        titre="Régions"
        description="Régions proposées dans tous les formulaires de déclaration."
        singulier="une région"
        lignes={lieux}
        action={actionEnregistrerLieu}
        actionDeplacer={actionDeplacerLieu}
        actionSupprimer={actionSupprimerLieu}
      />

      <EditeurReferentiel
        titre="Communes"
        description="Communes proposées selon la région choisie dans le formulaire."
        colonnes={['Région', 'Commune', 'État']}
        lignes={villes.map((ville) => ({
          id: String(ville.id),
          groupe: String(ville.region_id),
          cellules: [
            ville.lieux?.libelle ?? 'Région non renseignée',
            ville.libelle,
            { badge: ville.actif ? 'Actif' : 'Inactif', variant: ville.actif ? 'default' : 'secondary' },
          ],
          valeurs: {
            regionId: String(ville.region_id),
            libelle: ville.libelle,
            actif: ville.actif,
          },
        }))}
        champs={[
          {
            type: 'liste',
            nom: 'regionId',
            libelle: 'Région',
            requis: true,
            options: lieux.map((region) => ({ valeur: String(region.id), libelle: region.libelle })),
          },
          { type: 'texte', nom: 'libelle', libelle: 'Commune', requis: true, max: 255 },
          { type: 'booleen', nom: 'actif', libelle: 'Active' },
        ]}
        action={actionEnregistrerVille}
        actionDeplacer={actionDeplacerVille}
        actionSupprimer={actionSupprimerVille}
        creationPossible
        libelleCreation="Ajouter une commune"
        presentation="section"
        taillePage={24}
        libelleTousGroupes="Toutes les régions"
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
      presentation="section"
      taillePage={16}
    />
  )
}
