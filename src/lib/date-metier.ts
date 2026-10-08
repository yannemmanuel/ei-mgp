/** Fuseau de référence de la SODECI, explicite pour garantir le même HTML serveur et navigateur. */
export const FUSEAU_METIER = 'Africa/Abidjan'

export function formaterDateMetier(
  valeur: string | Date,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('fr-FR', {
    ...options,
    timeZone: FUSEAU_METIER,
  }).format(typeof valeur === 'string' ? new Date(valeur) : valeur)
}
