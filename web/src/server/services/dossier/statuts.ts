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
  /*
    ⚠️ « AFFECTÉ » A QUITTÉ LE CIRCUIT le 2026-09-21 : on n'affecte plus les dossiers.

    L'état était déjà devenu inatteignable — `ROLES_AFFECTATION_AUTOMATIQUE` est vide sur les
    quatre types depuis le 2026-09-20, donc `creerDeclaration()` n'y transitait plus —, mais rien
    ne le disait : il restait proposé dans la grille des étapes et dans les écrans
    d'administration, et un dossier qu'on y aurait mené n'en serait plus reparti.

    ⚠️ Ses cases de `role_etapes` ont été REPORTÉES sur « Reçu », qui devient l'étape de départ.
    Sans ce report, le seul Service MGP aurait pu démarrer un grief : les correspondants étaient
    cochés sur « Affecté », jamais sur « Reçu ». Ils auraient vu leurs dossiers arriver sans
    pouvoir les faire avancer d'un cran, sans message et sans erreur.

    La ligne `statuts_dossier` est conservée, désactivée : huit lignes d'historique la citent, et
    les fiches des quatre dossiers qui y sont passés doivent continuer de le montrer.
  */
  recu: ['en_analyse'],
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
