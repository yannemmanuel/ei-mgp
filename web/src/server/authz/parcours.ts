import type { Role } from './roles'

/**
 * Les 4 parcours du CDC §2.1 — port de `App\Enums\ParcoursCode`. Nombre fixe : aucune création
 * libre par l'administration, seuls les libellés en base restent administrables.
 */
export const PARCOURS_CODES = [
  'ei_employe',
  'grief_employe',
  'grief_sous_traitant',
  'grief_communaute',
] as const

export type ParcoursCode = (typeof PARCOURS_CODES)[number]

/**
 * Cloisonnement des dossiers par rôle × parcours — port de `App\Support\RoleParcoursScope`
 * (docs/acteurs.md §1, §2).
 *
 * Centralisé ici plutôt que dupliqué dans chaque policy : un seul endroit à faire évoluer si le
 * périmètre d'un rôle change. Un rôle absent des deux tables ci-dessous n'a accès à AUCUN
 * dossier par ce biais (ex. `administrateur_digital` — DT-02 —, `agent_relais` qui ne fait que
 * saisir).
 */
const ROLES_PAR_PARCOURS: Partial<Record<Role, readonly ParcoursCode[]>> = {
  secretaire_csst: ['ei_employe'],
  rqse: ['ei_employe'],
  rgp: ['grief_employe'],
  responsable_grief_employe: ['grief_employe'],
  comite_ethique: ['grief_employe'],
  correspondant_mgp: ['grief_employe', 'grief_sous_traitant', 'grief_communaute'],
  captage_grief_soustraitant: ['grief_sous_traitant'],
  captage_grief_communaute: ['grief_communaute'],
}

/** Accès transverse aux 4 parcours (docs/acteurs.md §2). */
const ROLES_TRANSVERSAUX = ['service_mgp', 'dg', 'auditeur', 'dpo'] as const satisfies readonly Role[]

export function estTransversal(roles: readonly Role[]): boolean {
  return roles.some((role) => (ROLES_TRANSVERSAUX as readonly string[]).includes(role))
}

export function peutVoirParcours(roles: readonly Role[], parcours: ParcoursCode): boolean {
  if (estTransversal(roles)) {
    return true
  }

  return roles.some((role) => ROLES_PAR_PARCOURS[role]?.includes(parcours) ?? false)
}

/** Liste vide = aucun accès par cloisonnement (l'appelant doit alors ne rien afficher). */
export function parcoursAutorises(roles: readonly Role[]): ParcoursCode[] {
  if (estTransversal(roles)) {
    return [...PARCOURS_CODES]
  }

  const autorises = new Set<ParcoursCode>()
  for (const role of roles) {
    for (const parcours of ROLES_PAR_PARCOURS[role] ?? []) {
      autorises.add(parcours)
    }
  }

  return [...autorises]
}
