import type { Permission } from '@/server/authz'
import { aUnePermissionParmi, type UtilisateurAutorise } from '@/server/authz'

/**
 * Structure de navigation du back-office — port fidèle de
 * `resources/views/components/layouts/app.blade.php` (Laravel), y compris ses conditions
 * d'affichage.
 *
 * ⚠️ Masquer un lien N'EST PAS un contrôle d'accès : chaque page cible refait sa propre
 * vérification serveur via `exigerPermission()`. Cette structure ne sert qu'à ne pas proposer
 * une destination qui aboutirait à un refus.
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
  'referentiels.categories.manage',
  'referentiels.statuts.manage',
  'referentiels.sites.manage',
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
    titre: 'Mon activité',
    liens: [
      { libelle: 'Mes dossiers', href: '/dossiers?assigneAMoi=1', icone: 'folder', permissions: PERMISSIONS_DOSSIERS },
      { libelle: 'Mes investigations', href: '/investigations?miennes=1', icone: 'clipboard', permissions: ['investigations.view'] },
      { libelle: 'Mes actions', href: '/actions-correctives?miennes=1', icone: 'wrench', permissions: ['actions.view'] },
    ],
  },
  {
    titre: 'Dossiers',
    liens: [{ libelle: 'Dossiers', href: '/dossiers', icone: 'folder', permissions: PERMISSIONS_DOSSIERS }],
  },
  {
    titre: 'Analyse',
    liens: [
      { libelle: 'Investigations', href: '/investigations', icone: 'clipboard', permissions: ['investigations.view'] },
      { libelle: 'Actions correctives', href: '/actions-correctives', icone: 'wrench', permissions: ['actions.view'] },
    ],
  },
  {
    titre: 'Administration',
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
