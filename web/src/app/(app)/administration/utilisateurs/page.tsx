import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { parcoursAutorises, parcoursDuRole, siteManquant, type ParcoursCode, type Role } from '@/server/authz'
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

  // Le périmètre réel du compte, calculé par le même code que celui qui décide en production.
  // Le recopier ici — « rôle ∩ attribution » — reviendrait à créer une seconde vérité, qui
  // finirait par afficher autre chose que ce que l'application applique.
  const perimetre = (c: { roles: string[]; parcours: string[] }) =>
    parcoursAutorises({ roles: c.roles as Role[], parcours: c.parcours as ParcoursCode[] })

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
          ⚠️ Le site DÉDUIT, et non la seule colonne.

          Un compte rattaché à une direction porte `site_id` à null — et il est pourtant bien
          cloisonné : `chargerUtilisateurAutorise()` déduit son site de la direction. Ne regarder
          que la colonne aurait signalé « site manquant » sur tous ces comptes, c'est-à-dire une
          alerte fausse sur le rattachement le plus précis des deux.
        */
        siteManquant: siteManquant(c.roles as Role[], c.site_id ?? c.directions?.site_id ?? null),
        // Ce qui lui a été confié, tel quel : c'est ce que le formulaire doit rouvrir coché.
        parcoursAttribues: c.parcours,
        // Ce qu'elle voit VRAIMENT — l'attribution croisée avec ce que ses rôles ouvrent. Les deux
        // listes diffèrent dès qu'on lui a confié un parcours que son rôle n'ouvre pas, et c'est
        // précisément ce qu'il faut montrer plutôt que laisser croire à un accès.
        parcours: perimetre(c).map((code) => libelleParcours.get(code) ?? code),
        tousLesParcours: perimetre(c).length === tousLesParcours.length,
        // Les parcours que ses rôles permettent de lui confier : le formulaire n'offre que ceux-là.
        parcoursPossibles: parcoursDuRole(c.roles as Role[]).map((code) => ({
          code,
          libelle: libelleParcours.get(code) ?? code,
        })),
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
        // Ce que ce rôle permet de confier — pour les rôles transverses, les 4 parcours.
        parcours: parcoursDuRole([r.name as Role]),
      }))}
      parcours={tousLesParcours.map((p) => ({ code: p.code, libelle: p.libelle }))}
      directions={referentiels.directions.map((d) => ({ id: String(d.id), libelle: d.libelle }))}
      sites={referentiels.sites.map((s) => ({ id: String(s.id), libelle: s.libelle }))}
      recherche={recherche}
    />
  )
}
