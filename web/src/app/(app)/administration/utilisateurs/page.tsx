import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { siteManquant, type Role } from '@/server/authz'
import { parcoursParRole } from '@/server/services/administration/habilitations'
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

  const [comptes, roles, referentiels, parcoursDesRoles, tousLesParcours] = await Promise.all([
    listerUtilisateurs(recherche),
    rolesDisponibles(),
    referentielsComptes(),
    parcoursParRole(),
    prisma.parcours.findMany({ orderBy: { ordre: 'asc' }, select: { code: true, libelle: true } }),
  ])

  /*
    Le périmètre d'un compte : l'union de ce que ses RÔLES ouvrent.

    ⚠️ Lu dans `role_parcours`, la même table que `chargerUtilisateurAutorise()`. Le recopier
    autrement reviendrait à créer une seconde vérité, qui finirait par afficher autre chose que
    ce que l'application applique.

    L'attribution par personne n'entre plus dans le calcul : le rôle décide seul.
  */
  const perimetre = (c: { roles: string[] }) => {
    const libelles = new Set<string>()

    for (const role of c.roles) {
      for (const parcours of parcoursDesRoles.get(role) ?? []) libelles.add(parcours.libelle)
    }

    return [...libelles]
  }

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
        /*
          ⚠️ Le site DÉDUIT, et LA DIRECTION — pas la seule colonne `site_id`.

          Un compte rattaché à une direction porte `site_id` à null, et il est pourtant le mieux
          cloisonné des deux : il ne reçoit que les déclarations de sa direction. Ne regarder que
          la colonne signalerait « site manquant » sur tous ces comptes, c'est-à-dire une alerte
          fausse sur le rattachement le plus précis — et une alerte fausse est ce qui finit par
          faire ignorer les vraies.
        */
        siteManquant: siteManquant(
          c.roles as Role[],
          c.site_id ?? c.directions?.site_id ?? null,
          c.direction_id
        ),
        // Ce que ce compte voit, d'après ses rôles. En lecture seule : le geste est dans les
        // habilitations.
        parcours: perimetre(c),
        tousLesParcours: perimetre(c).length === tousLesParcours.length,
        // Le compte est rattaché à un site ET à une direction qui relève d'un AUTRE site. Rien
        // ne l'interdit techniquement, mais l'un des deux est faux — et le dossier qu'on croira
        // lui adresser partira ailleurs.
        rattachementIncoherent:
          c.site_id !== null &&
          c.directions?.site_id != null &&
          c.directions.site_id !== c.site_id,
      }))}
      roles={roles.map((r) => ({
        nom: r.name,
        libelle: r.libelle,
        actif: r.actif,
        // Ce que ce rôle ouvre — lu en base, pour que le formulaire montre la conséquence des
        // cases cochées sans attendre un enregistrement.
        parcours: (parcoursDesRoles.get(r.name) ?? []).map((p) => p.code),
      }))}
      parcours={tousLesParcours.map((p) => ({ code: p.code, libelle: p.libelle }))}
      directions={referentiels.directions.map((d) => ({ id: String(d.id), libelle: d.libelle }))}
      sites={referentiels.sites.map((s) => ({ id: String(s.id), libelle: s.libelle }))}
      recherche={recherche}
    />
  )
}
