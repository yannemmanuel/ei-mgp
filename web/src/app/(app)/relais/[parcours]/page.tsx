import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { chargerReferentiels } from '@/server/services/declaration/referentiels-formulaire'
import { exigerPermission } from '@/server/auth'
import { PARCOURS, estParcoursValide } from '@/server/services/declaration/parcours-config'
import { CANAUX_RELAIS } from '@/server/services/declaration/soumission'
import { FormulaireDeclaration } from '@/app/(public)/declarer/[parcours]/formulaire'
import { soumettreDeclarationRelais } from './actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: PageProps<'/relais/[parcours]'>): Promise<Metadata> {
  const { parcours } = await params

  return {
    title: estParcoursValide(parcours) ? `Saisie relais — ${PARCOURS[parcours].titre}` : 'Saisie relais',
  }
}

/**
 * EX-DEC-10 : saisie relais par un agent, pour une déclaration reçue hors ligne (ligne verte,
 * boîte à suggestions, échange direct).
 *
 * Même formulaire que la voie publique, à deux différences près : l'accès exige
 * `dossiers.create`, et le canal d'origine doit être choisi explicitement (RG-13).
 */
export default async function PageRelais({ params }: PageProps<'/relais/[parcours]'>) {
  await exigerPermission('dossiers.create')

  const { parcours } = await params

  if (!estParcoursValide(parcours)) {
    notFound()
  }

  const config = PARCOURS[parcours]
  const ligneParcours = await prisma.parcours.findFirstOrThrow({ where: { code: parcours } })

  const [categories, niveaux, referentiels, canaux] = await Promise.all([
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
    prisma.canaux_captage.findMany({
      where: { code: { in: [...CANAUX_RELAIS] }, actif: true },
      orderBy: { libelle: 'asc' },
      select: { code: true, libelle: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <Link href="/relais" className="text-sm text-muted-foreground hover:text-secondary-900">
        ← Choisir un autre parcours
      </Link>

      <FormulaireDeclaration
        config={config}
        categories={categories.map((c) => ({ valeur: String(c.id), libelle: c.libelle }))}
        categoriesAutre={categories.filter((c) => c.is_autre).map((c) => String(c.id))}
        niveauxGravite={niveaux.map((n) => ({ valeur: String(n.id), libelle: n.libelle }))}
        referentiels={referentiels}
        soumettre={soumettreDeclarationRelais}
        canauxRelais={canaux.map((c) => ({ valeur: c.code, libelle: c.libelle }))}
      />
    </div>
  )
}
