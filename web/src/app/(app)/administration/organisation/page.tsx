import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { listerDirections, listerSites } from '@/server/services/administration/referentiels'
import { PanneauOrganisation } from './panneau'

export const metadata: Metadata = { title: 'Administration — Sites et directions' }
export const dynamic = 'force-dynamic'

/**
 * Sites et directions, dans un seul écran.
 *
 * Les deux référentiels décrivent la même organisation : les séparer obligeait à ouvrir chaque
 * direction pour lire — puis changer — une information qui n'a de sens que rapportée au site.
 *
 * Une seule permission les couvre (`referentiels.sites.manage`) : ouvrir une permission de plus
 * pour la moitié d'un référentiel compliquerait la matrice sans rien protéger de plus.
 */
export default async function PageOrganisation() {
  await exigerPermission('referentiels.sites.manage')

  const [sites, directions] = await Promise.all([listerSites(), listerDirections()])

  return (
    <PanneauOrganisation
      sites={sites.map((s) => ({
        id: String(s.id),
        code: s.code,
        libelle: s.libelle,
        actif: s.actif,
        comptes: s._count.users,
      }))}
      directions={directions.map((d) => ({
        id: String(d.id),
        code: d.code,
        libelle: d.libelle,
        actif: d.actif,
        siteId: d.site_id === null ? null : String(d.site_id),
        comptes: d._count.users,
      }))}
    />
  )
}
