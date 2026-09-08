import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { siteManquant, type Role } from '@/server/authz'
import {
  listerUtilisateurs,
  referentielsComptes,
  rolesDisponibles,
} from '@/server/services/administration/utilisateurs'
import { PanneauComptes } from './panneau'

export const metadata: Metadata = { title: 'Administration — Comptes' }
export const dynamic = 'force-dynamic'

export default async function PageComptes({
  searchParams,
}: PageProps<'/administration/utilisateurs'>) {
  await exigerPermission('users.manage')

  const parametres = await searchParams
  const brut = parametres.q
  const recherche = (Array.isArray(brut) ? brut[0] : brut) ?? ''

  const [comptes, roles, referentiels] = await Promise.all([
    listerUtilisateurs(recherche),
    rolesDisponibles(),
    referentielsComptes(),
  ])

  return (
    <PanneauComptes
      comptes={comptes.map((c) => ({
        id: String(c.id),
        name: c.name,
        email: c.email,
        matricule: c.matricule ?? '',
        poste: c.poste ?? '',
        actif: c.actif,
        directionId: c.direction_id === null ? '' : String(c.direction_id),
        siteId: c.site_id === null ? '' : String(c.site_id),
        responsableId:
          c.responsable_hierarchique_id === null ? '' : String(c.responsable_hierarchique_id),
        roles: c.roles,
        siteManquant: siteManquant(c.roles as Role[], c.site_id),
      }))}
      roles={roles.map((r) => ({ nom: r.name, libelle: r.libelle, actif: r.actif }))}
      directions={referentiels.directions.map((d) => ({ id: String(d.id), libelle: d.libelle }))}
      sites={referentiels.sites.map((s) => ({ id: String(s.id), libelle: s.libelle }))}
      recherche={recherche}
    />
  )
}
