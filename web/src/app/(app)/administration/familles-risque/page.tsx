import type { Metadata } from 'next'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { chargerParametrageFamillesRisque } from '@/server/services/administration/familles-risque'
import { EditeurFamillesRisque } from './editeur'

export const metadata: Metadata = { title: 'Administration — Familles de risque' }
export const dynamic = 'force-dynamic'

/**
 * Où la famille de risque est demandée aux traitants.
 *
 * ⚠️ CE QUE CET ÉCRAN NE FAIT PAS, et pourquoi : il ne crée ni ne renomme les familles. Il décide
 * seulement à quels types de déclaration la question est posée — c'est ce que le métier a demandé
 * (« retirer les familles sur les EI, mais laisser une possibilité de paramétrage »). Les familles
 * elles-mêmes sont affichées en lecture, pour qu'on voie ce qu'on active.
 */
export default async function PageFamillesRisque() {
  await exigerPermission('referentiels.categories.manage')

  const { types, familles } = await chargerParametrageFamillesRisque()

  const qualifiants = types.filter((t) => t.qualifieLaFamille).length

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Familles de risque"
        lede="À quels types de déclaration la famille de risque est demandée pendant le traitement."
        mailles={[
          { libelle: 'Administration', href: '/administration' },
          { libelle: 'Familles de risque' },
        ]}
        compteur={`${qualifiants} type(s) sur ${types.length} · ${familles.filter((f) => f.actif).length} familles actives`}
      />

      <EditeurFamillesRisque
        types={types.map((t) => ({
          code: t.code,
          libelle: t.libelle,
          actif: t.actif,
          qualifieLaFamille: t.qualifieLaFamille,
          dossiersQualifies: t.dossiersQualifies,
        }))}
        familles={familles.map((f) => ({
          id: f.id,
          code: f.code,
          libelle: f.libelle,
          actif: f.actif,
          dossiers: f.dossiers,
        }))}
      />
    </div>
  )
}
