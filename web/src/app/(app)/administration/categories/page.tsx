import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { listerCategories } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionDeplacerCategorie, actionEnregistrerCategorie, actionSupprimerCategorie } from '../actions'

export const metadata: Metadata = { title: 'Administration — Catégories' }
export const dynamic = 'force-dynamic'

export default async function PageCategories() {
  await exigerPermission('referentiels.categories.manage')

  const [categories, parcours] = await Promise.all([
    listerCategories(),
    prisma.parcours.findMany({ orderBy: { ordre: 'asc' }, select: { id: true, libelle: true } }),
  ])

  return (
    <EditeurReferentiel
      titre="Catégories"
      description="Catégories de déclaration proposées dans les formulaires, par parcours."
      colonnes={['Parcours', 'Code', 'Libellé', 'Autre', 'État']}
      lignes={categories.map((c) => ({
        id: String(c.id),
        // Le rang d'une catégorie se compte DANS son parcours : monter la première d'un parcours
        // ne doit pas la faire passer dans le précédent.
        groupe: String(c.parcours_id),
        cellules: [
          c.parcours.libelle,
          c.code,
          c.libelle,
          c.is_autre ? 'Oui' : '—',
          { badge: c.actif ? 'Actif' : 'Inactif', variant: c.actif ? 'default' : 'secondary' },
        ],
        valeurs: {
          parcoursId: String(c.parcours_id),
          code: c.code,
          libelle: c.libelle,
          isAutre: c.is_autre,
          actif: c.actif,
        },
      }))}
      champs={[
        {
          type: 'liste',
          nom: 'parcoursId',
          libelle: 'Parcours',
          requis: true,
          options: parcours.map((p) => ({ valeur: String(p.id), libelle: p.libelle })),
        },
        { type: 'texte', nom: 'code', libelle: 'Code', requis: true, max: 100 },
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        { type: 'booleen', nom: 'isAutre', libelle: 'Catégorie « Autre »' },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={actionEnregistrerCategorie}
      actionDeplacer={actionDeplacerCategorie}
      actionSupprimer={actionSupprimerCategorie}
      creationPossible
      libelleCreation="Ajouter une catégorie"
    />
  )
}
