/**
 * Statuts internes du cycle de vie d'un dossier (CDC §7.1) — port de
 * `App\Enums\StatutDossierCode`.
 *
 * Le nombre de statuts est fixe : le référentiel `statuts_dossier` reste administrable pour ses
 * LIBELLÉS, jamais pour l'ajout ou le retrait d'un état — le graphe de transitions ci-dessous
 * n'aurait plus de sens.
 */
export const STATUTS = [
  'recu',
  'affecte',
  'en_analyse',
  'en_investigation',
  'en_attente_information',
  'action_corrective_en_cours',
  'resolu',
  'cloture',
  'reouvert',
  'rejete',
] as const

export type StatutCode = (typeof STATUTS)[number]

/**
 * Graphe des transitions MANUELLES autorisées (docs/workflows.md §1).
 *
 * Rejet, clôture et réouverture n'y figurent pas : ils exigent des données supplémentaires
 * (motif, synthèse) et des règles propres (RG-07, RG-10), et passent donc par des fonctions
 * dédiées.
 */
export const TRANSITIONS_AUTORISEES: Partial<Record<StatutCode, readonly StatutCode[]>> = {
  recu: ['affecte'],
  affecte: ['en_analyse'],
  en_analyse: ['en_investigation'],
  en_investigation: ['en_attente_information', 'action_corrective_en_cours'],
  en_attente_information: ['en_investigation'],
  action_corrective_en_cours: ['resolu'],
  reouvert: ['en_investigation', 'action_corrective_en_cours'],
}

export function transitionAutorisee(depuis: StatutCode, vers: StatutCode): boolean {
  return TRANSITIONS_AUTORISEES[depuis]?.includes(vers) ?? false
}

export function transitionsDepuis(depuis: StatutCode): readonly StatutCode[] {
  return TRANSITIONS_AUTORISEES[depuis] ?? []
}
