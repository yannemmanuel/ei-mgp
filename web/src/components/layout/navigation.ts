import type { Permission } from '@/server/authz'
import { aUnePermissionParmi, type UtilisateurAutorise } from '@/server/authz'

/**
 * Structure de navigation du back-office.
 *
 * ⚠️ Masquer un lien N'EST PAS un contrôle d'accès : chaque page cible refait sa propre
 * vérification serveur via `exigerPermission()`. Cette structure ne sert qu'à ne pas proposer
 * une destination qui aboutirait à un refus.
 *
 * UNE ENTRÉE PAR OBJET MÉTIER. La barre latérale portait auparavant « Mes dossiers » et
 * « Dossiers », « Mes investigations » et « Investigations » — la même destination deux fois, à
 * un paramètre d'URL près. Deux effets, tous deux mauvais : le repère d'écran courant
 * s'allumait sur les deux lignes à la fois (la comparaison ignore la query string), et la barre
 * comptait huit entrées pour quatre destinations. Le filtre « les miennes » vit désormais en
 * haut de chaque liste, où il se voit, s'annule et se combine avec les autres critères.
 */
export type LienNavigation = {
  readonly libelle: string
  readonly href: string
  readonly icone: string
  /** Le lien s'affiche si l'utilisateur détient AU MOINS UNE de ces permissions. */
  readonly permissions: readonly Permission[]
}

export type SectionNavigation = {
  readonly titre: string | null
  readonly liens: readonly LienNavigation[]
}

const PERMISSIONS_DOSSIERS = ['dossiers.view', 'dossiers.view.all', 'dossiers.view.own'] as const

const PERMISSIONS_ADMINISTRATION = [
  'users.manage',
  'roles.manage',
  'referentiels.categories.manage',
  'referentiels.statuts.manage',
  'referentiels.sites.manage',
  'referentiels.delais.manage',
  'referentiels.gravites.manage',
  'canaux.manage',
  'notifications.templates.manage',
  'qrcodes.manage',
] as const

const SECTIONS: readonly SectionNavigation[] = [
  {
    titre: null,
    liens: [
      // Le tableau de bord est la page d'atterrissage de TOUT utilisateur authentifié : son
      // contenu se ramifie selon `reporting.view`, mais l'accès n'est jamais refusé (DT-31).
      { libelle: 'Tableau de bord', href: '/dashboard', icone: 'chart-bar', permissions: [] },
    ],
  },
  {
    titre: 'Traitement',
    liens: [
      { libelle: 'Dossiers', href: '/dossiers', icone: 'folder', permissions: PERMISSIONS_DOSSIERS },
      { libelle: 'Investigations', href: '/investigations', icone: 'clipboard', permissions: ['investigations.view'] },
      { libelle: 'Actions correctives', href: '/actions-correctives', icone: 'wrench', permissions: ['actions.view'] },
      // EX-DEC-10 : `agent_relais` ne porte QUE `dossiers.create` — c'est son unique entrée.
      { libelle: 'Saisie relais', href: '/relais', icone: 'inbox', permissions: ['dossiers.create'] },
    ],
  },
  {
    titre: 'Pilotage',
    liens: [
      { libelle: 'Administration', href: '/administration', icone: 'cog', permissions: PERMISSIONS_ADMINISTRATION },
      { libelle: 'Audit', href: '/audit', icone: 'shield', permissions: ['audit.view'] },
    ],
  },
]

/** Ne conserve que les sections et liens accessibles à cet utilisateur. */
export function navigationPour(utilisateur: UtilisateurAutorise): SectionNavigation[] {
  return SECTIONS.map((section) => ({
    ...section,
    liens: section.liens.filter(
      (lien) => lien.permissions.length === 0 || aUnePermissionParmi(utilisateur, lien.permissions)
    ),
  })).filter((section) => section.liens.length > 0)
}

/** Toutes les destinations déclarées, à plat — utilisé par le test de non-régression. */
export function toutesLesDestinations(): string[] {
  return SECTIONS.flatMap((section) => section.liens.map((lien) => lien.href))
}
