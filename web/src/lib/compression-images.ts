/**
 * Réduction des images DANS LE NAVIGATEUR, avant le dépôt.
 *
 * Pourquoi avant, et non après réception : une pièce jointe est une **preuve**
 * (`docs/exigences-audit.md`), et chaque pièce porte un `checksum_sha256` calculé sur les octets
 * reçus. Ré-encoder au serveur changerait ces octets APRÈS le calcul du condensat — la colonne
 * perdrait précisément ce qu'elle garantit. Réduire avant le dépôt fait de l'image réduite
 * l'original de référence : le condensat couvre exactement ce qui a été déposé, et la chaîne
 * reste intacte.
 *
 * Contrepartie assumée, et à énoncer au déclarant : la pleine résolution n'existe jamais côté
 * serveur. Pour constater un extincteur vide ou un garde-corps cassé, 2000 px suffisent
 * largement ; pour une expertise au pixel près, non.
 *
 * Ce module ne dépend que d'API du navigateur — il n'est jamais exécuté au serveur.
 */

/** Côté le plus long, en pixels, au-delà duquel une image est réduite. */
export const COTE_MAX = 2000

/** Qualité d'encodage. 0,82 : au-dessus, le poids grimpe sans gain visible à l'écran. */
export const QUALITE = 0.82

/**
 * Formats ré-encodés, du plus économe au plus sûr.
 *
 * WebP pèse 25 à 35 % de moins que JPEG à qualité perçue égale. Tous les navigateurs ne savent
 * pas l'ÉCRIRE depuis un canvas — le décoder est une autre affaire — d'où le repli JPEG, choisi
 * sur le résultat réel plutôt que sur une détection de navigateur : si l'encodage WebP échoue ou
 * n'est pas honoré, le format demandé n'est pas celui rendu, et on le voit.
 */
const FORMATS_SORTIE = [
  { type: 'image/webp', extension: 'webp' },
  { type: 'image/jpeg', extension: 'jpg' },
] as const

/**
 * Types réduits, et types laissés intacts.
 *
 * Le GIF est délibérément exclu : un canvas n'en retient que la PREMIÈRE IMAGE. Le « compresser »
 * détruirait l'animation, c'est-à-dire l'information même que la pièce apporte. Vidéos et PDF le
 * sont aussi — un navigateur ne les ré-encode pas dans des conditions acceptables.
 */
export function estCompressible(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType.toLowerCase().trim())
}

/**
 * Dimensions cibles, à proportions conservées.
 *
 * Une image déjà plus petite que la borne n'est jamais AGRANDIE : ce serait gonfler le poids pour
 * rien, et inventer des pixels qui n'ont pas été photographiés.
 */
export function dimensionsCibles(
  largeur: number,
  hauteur: number,
  coteMax = COTE_MAX
): { largeur: number; hauteur: number } {
  const plusGrandCote = Math.max(largeur, hauteur)

  if (plusGrandCote <= coteMax) return { largeur, hauteur }

  const facteur = coteMax / plusGrandCote

  // `max(1, …)` : une image très allongée verrait sinon son petit côté arrondi à zéro, et le
  // canvas refuserait une dimension nulle.
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  }
}

/** Le nom déposé suit le format réellement produit, sinon le serveur refuserait la pièce. */
export function renommer(nom: string, extension: string): string {
  const base = nom.replace(/\.[^./\\]+$/, '') || 'image'
  return `${base}.${extension}`
}

async function encoder(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string
): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality: QUALITE })
  }

  return new Promise((resoudre) => canvas.toBlob(resoudre, type, QUALITE))
}

/**
 * Réduit une image, ou rend l'originale inchangée.
 *
 * Jamais d'échec propagé : une pièce que le navigateur ne sait pas décoder doit partir telle
 * quelle. Perdre une preuve parce que sa réduction a échoué serait un remède pire que le mal.
 */
export async function compresserImage(fichier: File): Promise<File> {
  if (!estCompressible(fichier.type)) return fichier
  if (typeof createImageBitmap !== 'function') return fichier

  try {
    // `imageOrientation` : sans cette option, une photo prise en portrait — dont l'orientation
    // n'est portée que par ses métadonnées EXIF — est redressée par le canvas et déposée couchée.
    const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
    const { largeur, hauteur } = dimensionsCibles(image.width, image.height)

    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(largeur, hauteur)
        : Object.assign(document.createElement('canvas'), { width: largeur, height: hauteur })

    const contexte = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null

    if (!contexte) return fichier

    contexte.drawImage(image, 0, 0, largeur, hauteur)
    image.close()

    for (const format of FORMATS_SORTIE) {
      const blob = await encoder(canvas, format.type)

      // Un navigateur qui ne sait pas écrire ce format rend autre chose que ce qui est demandé —
      // du PNG, le plus souvent, donc plus lourd. On lit le type OBTENU, on ne le suppose pas.
      if (!blob || blob.type !== format.type) continue

      // Réduire ne doit jamais alourdir : une image déjà optimisée, ou petite, sort inchangée.
      if (blob.size >= fichier.size) return fichier

      return new File([blob], renommer(fichier.name, format.extension), {
        type: format.type,
        lastModified: fichier.lastModified,
      })
    }

    return fichier
  } catch {
    return fichier
  }
}

/** Réduit le lot, en préservant l'ordre choisi par le déclarant. */
export async function compresserLot(fichiers: readonly File[]): Promise<File[]> {
  return Promise.all(fichiers.map(compresserImage))
}
