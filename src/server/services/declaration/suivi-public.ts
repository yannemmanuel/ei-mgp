/**
 * Étapes visibles du déclarant.
 *
 * Plusieurs statuts internes partagent le même libellé affiché (« En traitement » couvre
 * l'investigation, l'attente d'information et les actions) : deux étapes consécutives au même
 * libellé n'en font qu'une, datée de la PREMIÈRE — sinon la chronologie trahirait les transitions
 * internes que RGI-10 cache.
 *
 * La création du dossier inscrit déjà « Reçu » dans l'historique : c'est la première étape, sans
 * en ajouter une « déposée » qui la doublerait.
 */
export function historiquePublic(
  deposeLe: Date,
  transitions: { libelle: string; le: Date }[],
  libelleActuel: string
): { libelle: string; le: string }[] {
  const etapes: { libelle: string; le: Date }[] = []

  for (const t of transitions) {
    if (etapes.at(-1)?.libelle !== t.libelle) etapes.push(t)
  }

  // Un dossier sans historique (antérieur au journal des transitions) montre au moins son état.
  if (etapes.length === 0) etapes.push({ libelle: libelleActuel, le: deposeLe })

  return etapes.map((e) => ({ libelle: e.libelle, le: e.le.toISOString() }))
}

/**
 * Le parcours public type, déduit du référentiel des statuts : leurs libellés affichés, dans
 * l'ordre, chacun une seule fois. Les statuts désactivés n'y figurent pas ; un libellé déjà vu
 * (la réouverture « En traitement », le rejet « Clôturé ») ne crée pas d'étape de plus.
 */
export function parcoursPublicType(
  statuts: { libelle_affiche: string; ordre: number; actif: boolean }[]
): string[] {
  const libelles: string[] = []

  for (const s of [...statuts].sort((a, b) => a.ordre - b.ordre)) {
    if (s.actif && !libelles.includes(s.libelle_affiche)) libelles.push(s.libelle_affiche)
  }

  return libelles
}

/**
 * Étapes encore à franchir, montrées grisées après l'étape actuelle.
 *
 * Aucune pour un dossier terminé — y compris rejeté, qui saute directement à « Clôturé ». Aucune
 * non plus si l'état actuel ne figure pas dans le parcours type : mieux vaut ne rien annoncer que
 * promettre une suite fausse.
 */
export function etapesAVenir(
  libelleActuel: string,
  parcoursType: string[],
  termine: boolean
): string[] {
  if (termine) return []

  const position = parcoursType.lastIndexOf(libelleActuel)
  return position === -1 ? [] : parcoursType.slice(position + 1)
}
