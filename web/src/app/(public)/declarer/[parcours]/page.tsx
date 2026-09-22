import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PARCOURS, estParcoursValide } from '@/server/services/declaration/parcours-config'
import { chargerReferentiels } from '@/server/services/declaration/referentiels-formulaire'
import { signerHorodatage } from '@/server/auth/horodatage-signe'
import { FormulaireDeclaration } from './formulaire'

/**
 * Formulaire public de déclaration — une route dynamique pour les 4 parcours (EX-DEC-01/02/05).
 *
 * Accès libre, sans compte : c'est la contrainte structurante du CDC (§5.3/§5.4) et la surface
 * d'abus la plus large de l'application. Toute la validation qui compte est refaite dans la
 * Server Action.
 */
/**
 * Rendu dynamique imposé, PAS de prerendu statique : les categories et niveaux de gravite sont
 * administrables et doivent refleter la base a chaque affichage, et
 * l'horodatage anti-robot (DT-14) doit etre frais. Un prerendu figerait les deux a la
 * compilation.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/declarer/[parcours]'>): Promise<Metadata> {
  const { parcours } = await params

  if (!estParcoursValide(parcours)) {
    return { title: 'Déclaration' }
  }

  return { title: PARCOURS[parcours].titre }
}

export default async function PageDeclaration({ params }: PageProps<'/declarer/[parcours]'>) {
  const { parcours } = await params

  if (!estParcoursValide(parcours)) {
    notFound()
  }

  const config = PARCOURS[parcours]
  const ligneParcours = await prisma.parcours.findFirstOrThrow({ where: { code: parcours } })

  const [categories, niveaux, referentiels] = await Promise.all([
    prisma.categories.findMany({
      where: { parcours_id: ligneParcours.id, actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, libelle: true, is_autre: true },
    }),
    prisma.niveaux_gravite.findMany({
      where: { actif: true },
      orderBy: { niveau: 'asc' },
      select: { id: true, libelle: true },
    }),
    chargerReferentiels(),
  ])

  return (
    <FormulaireDeclaration
      config={config}
      categories={categories.map((c) => ({ valeur: String(c.id), libelle: c.libelle }))}
      categoriesAutre={categories.filter((c) => c.is_autre).map((c) => String(c.id))}
      niveauxGravite={niveaux.map((n) => ({ valeur: String(n.id), libelle: n.libelle }))}
      referentiels={referentiels}
      /*
        ⚠️ SIGNÉ AU RENDU, et c'est ce qui rend le délai minimal vérifiable (DT-14). La valeur
        était posée par le navigateur au montage : un robot postait « maintenant − 10 » et
        franchissait les trois secondes sans attendre. Le rendu est déjà dynamique — c'était
        justement pour que cet horodatage soit frais.
      */
      horodatageSigne={signerHorodatage()}
    />
  )
}
