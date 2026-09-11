import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { parcoursAutorises, siteManquant, type Role } from '@/server/authz'
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

  const [comptes, roles, referentiels, tousLesParcours] = await Promise.all([
    listerUtilisateurs(recherche),
    rolesDisponibles(),
    referentielsComptes(),
    prisma.parcours.findMany({ orderBy: { ordre: 'asc' }, select: { code: true, libelle: true } }),
  ])

  // Les codes ne disent rien à personne : l'écran affiche les libellés du référentiel.
  const libelleParcours = new Map(tousLesParcours.map((p) => [p.code, p.libelle]))

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
        site: c.sites?.libelle ?? null,
        direction: c.directions?.libelle ?? null,
        siteManquant: siteManquant(c.roles as Role[], c.site_id),
        // Ce que la personne voit réellement, déduit de ses rôles — la moitié invisible de ses
        // habilitations, celle qu'aucun écran ne disait.
        parcours: parcoursAutorises(c.roles as Role[]).map(
          (code) => libelleParcours.get(code) ?? code
        ),
        tousLesParcours: parcoursAutorises(c.roles as Role[]).length === tousLesParcours.length,
        // Le compte est rattaché à un site ET à une direction qui relève d'un AUTRE site. Rien
        // ne l'interdit techniquement, mais l'un des deux est faux — et le dossier qu'on croira
        // lui adresser partira ailleurs.
        rattachementIncoherent:
          c.site_id !== null &&
          c.directions?.site_id != null &&
          c.directions.site_id !== c.site_id,
      }))}
      roles={roles.map((r) => ({ nom: r.name, libelle: r.libelle, actif: r.actif }))}
      directions={referentiels.directions.map((d) => ({ id: String(d.id), libelle: d.libelle }))}
      sites={referentiels.sites.map((s) => ({ id: String(s.id), libelle: s.libelle }))}
      recherche={recherche}
    />
  )
}
