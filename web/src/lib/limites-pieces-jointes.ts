/**
 * EX-DEC-06 / RGI-04 : 3 fichiers maximum, 5 Mo au total par déclaration.
 *
 * Le plafond a varié deux fois en trois jours. Il est passé de 5 à 10 fichiers et de 10 à 50 Mo
 * le 08/09/2026, la réduction des images dans le navigateur (`compression-images.ts`) rendant la
 * hausse tenable ; le retour métier du 11/09 l'a ramené à 3 fichiers et 5 Mo, pour les quatre
 * formulaires. C'est ce dernier arbitrage qui s'applique.
 *
 * La réduction des images, elle, reste en place : elle n'était pas la contrepartie du plafond
 * haut mais une amélioration à part entière, et elle rend ce plafond bas d'autant plus facile à
 * tenir — trois photos réduites passent là où une seule photo brute ne passait pas.
 *
 * Ces constantes vivent ici, et non dans le service serveur, parce que le formulaire les annonce
 * (« 10 fichiers maximum, 50 Mo au total ») et doit les faire respecter AVANT l'envoi. Un module
 * partagé plutôt que deux jeux de valeurs : une promesse faite au déclarant et une règle
 * appliquée au serveur qui divergeraient produiraient exactement ce qu'on veut éviter — un envoi
 * accepté par l'écran puis refusé après coup, une fois les octets déjà transmis.
 *
 * Aucune dépendance : ce module est importé par un composant client, il ne doit rien entraîner
 * du serveur dans le bundle du navigateur.
 */
export const MAX_FICHIERS = 3
export const MAX_MEGAOCTETS_TOTAL = 5
export const MAX_OCTETS_TOTAL = MAX_MEGAOCTETS_TOTAL * 1024 * 1024

export const MESSAGE_TROP_DE_FICHIERS = `Un maximum de ${MAX_FICHIERS} fichiers est autorisé par déclaration.`
export const MESSAGE_LOT_TROP_LOURD = `La taille totale des pièces jointes dépasse ${MAX_MEGAOCTETS_TOTAL} Mo.`

/**
 * Contrôle du lot par le nombre et le poids, sans lire les octets.
 *
 * Renvoie le message à afficher, ou `null` si le lot passe. Le type réel de chaque fichier, lui,
 * n'est vérifiable qu'à partir de ses octets d'en-tête et reste l'affaire du serveur : le
 * navigateur ne fait ici qu'éviter un aller-retour perdu, il ne fait jamais autorité.
 */
export function verifierLotSuperficiellement(
  fichiers: readonly { readonly size: number }[]
): string | null {
  if (fichiers.length > MAX_FICHIERS) return MESSAGE_TROP_DE_FICHIERS

  const total = fichiers.reduce((somme, f) => somme + f.size, 0)
  if (total > MAX_OCTETS_TOTAL) return MESSAGE_LOT_TROP_LOURD

  return null
}
