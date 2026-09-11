/**
 * Ce qu'une pièce jointe peut être MONTRÉE, et sous quelle forme.
 *
 * Le tableau de bord doit pouvoir prévisualiser une pièce sans la télécharger. Or
 * `docs/exigences-securite.md` §3 interdit qu'un fichier téléversé par un tiers soit rendu dans
 * le contexte de l'application — d'où la règle posée ici : **seuls les types que le navigateur
 * traite comme un média inerte** sont prévisualisables, et l'aperçu n'est proposé pour rien
 * d'autre. Un type inconnu ou inattendu reste téléchargeable, jamais affiché.
 *
 * La liste ne doit pas dériver de celle acceptée au téléversement
 * (`TYPES_AUTORISES`, service des pièces jointes) : un test lie les deux.
 *
 * Aucune dépendance : ce module est importé des deux côtés de la frontière serveur.
 */
export type FormatApercu = 'image' | 'video' | 'pdf'

const FORMATS: Record<string, FormatApercu> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'pdf',
}

/** Le format d'aperçu d'un type MIME, ou `null` si la pièce ne doit pas être affichée. */
export function formatApercu(mimeType: string): FormatApercu | null {
  return FORMATS[mimeType.toLowerCase().trim()] ?? null
}
