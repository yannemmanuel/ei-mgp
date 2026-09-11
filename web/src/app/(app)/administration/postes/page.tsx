import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { listerPostes } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionEnregistrerPoste } from '../actions'

export const metadata: Metadata = { title: 'Administration — Postes' }
export const dynamic = 'force-dynamic'

/**
 * Postes par direction (ADM2).
 *
 * C'est ce référentiel qui alimente la cascade du formulaire EI : choisir une direction y remplit
 * la liste des postes. Un poste retiré de l'usage se DÉSACTIVE — il disparaît des nouvelles
 * déclarations et reste lisible sur celles qui l'ont retenu.
 */
export default async function PagePostes() {
  await exigerPermission('referentiels.sites.manage')

  const [postes, directions] = await Promise.all([
    listerPostes(),
    prisma.directions.findMany({
      where: { actif: true },
      orderBy: { libelle: 'asc' },
      select: { id: true, libelle: true },
    }),
  ])

  return (
    <EditeurReferentiel
      titre="Postes"
      description="Postes proposés dans le formulaire, selon la direction choisie."
      colonnes={['Direction', 'Poste', 'Ordre', 'État']}
      lignes={postes.map((p) => ({
        id: String(p.id),
        cellules: [
          p.directions.libelle,
          p.libelle,
          String(p.ordre),
          { badge: p.actif ? 'Actif' : 'Inactif', variant: p.actif ? 'default' : 'secondary' },
        ],
        valeurs: {
          directionId: String(p.direction_id),
          libelle: p.libelle,
          ordre: String(p.ordre),
          actif: p.actif,
        },
      }))}
      champs={[
        {
          type: 'liste',
          nom: 'directionId',
          libelle: 'Direction',
          requis: true,
          options: directions.map((d) => ({ valeur: String(d.id), libelle: d.libelle })),
        },
        { type: 'texte', nom: 'libelle', libelle: 'Poste', requis: true, max: 255 },
        { type: 'nombre', nom: 'ordre', libelle: 'Ordre d’affichage', requis: true, min: 1 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={actionEnregistrerPoste}
      creationPossible
      libelleCreation="Ajouter un poste"
    />
  )
}
