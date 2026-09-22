import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { magasinCourant } from '../stockage/magasin'
import { fileTypeFromBuffer } from 'file-type'
import { ulid } from 'ulid'
import {
  MAX_FICHIERS,
  MAX_OCTETS_TOTAL,
  MESSAGE_LOT_TROP_LOURD,
  MESSAGE_TROP_DE_FICHIERS,
} from '@/lib/limites-pieces-jointes'

/**
 * EX-DEC-06 / RGI-04 : 10 fichiers maximum, 50 Mo au total par déclaration.
 *
 * Port de `App\Services\Declaration\PieceJointeUploadService`. Le type RÉEL de chaque fichier
 * est revérifié à partir de ses octets d'en-tête (équivalent de `finfo` côté PHP) : le type MIME
 * annoncé par le navigateur n'est jamais une preuve suffisante
 * (docs/exigences-securite.md §3).
 */
// Réexportés pour les appelants historiques ; ils sont définis dans `@/lib/limites-pieces-jointes`,
// que le formulaire importe aussi — le navigateur et le serveur appliquent les mêmes bornes.
export { MAX_FICHIERS, MAX_OCTETS_TOTAL }

/**
 * Extension attendue → type MIME réel accepté. Liste blanche : ce qui n'y figure pas est refusé.
 *
 * Exporté pour que l'aperçu du tableau de bord puisse être confronté à cette liste : tout type
 * accepté ici doit être affichable, sans quoi une pièce déposée deviendrait consultable seulement
 * en la téléchargeant (voir `lib/__tests__/apercu-pieces-jointes.test.ts`).
 */
export const TYPES_AUTORISES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
}

export class ErreurPieceJointe extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurPieceJointe'
  }
}

export type FichierAValider = {
  readonly nom: string
  readonly octets: Buffer
}

export type PieceJointePreparee = {
  readonly id: string
  readonly disque: string
  readonly chemin: string
  readonly nomOriginal: string
  readonly mimeType: string
  readonly tailleOctets: number
  readonly checksumSha256: string
  readonly octets: Buffer
}

function extensionDe(nom: string): string {
  return path.extname(nom).replace('.', '').toLowerCase()
}

/**
 * Valide le lot AVANT toute écriture : un lot rejeté ne doit jamais laisser un dossier créé
 * sans ses pièces jointes (l'ordre compte : voir `stockerFichiers`).
 */
export async function verifierLot(fichiers: readonly FichierAValider[]): Promise<void> {
  if (fichiers.length > MAX_FICHIERS) {
    throw new ErreurPieceJointe(MESSAGE_TROP_DE_FICHIERS)
  }

  const tailleTotale = fichiers.reduce((somme, f) => somme + f.octets.byteLength, 0)

  if (tailleTotale > MAX_OCTETS_TOTAL) {
    throw new ErreurPieceJointe(MESSAGE_LOT_TROP_LOURD)
  }

  for (const fichier of fichiers) {
    await verifierTypeReel(fichier)
  }
}

async function verifierTypeReel(fichier: FichierAValider): Promise<void> {
  const extension = extensionDe(fichier.nom)
  const attendu = TYPES_AUTORISES[extension]
  const detecte = (await fileTypeFromBuffer(fichier.octets))?.mime

  if (!attendu || attendu !== detecte) {
    throw new ErreurPieceJointe(`Le fichier « ${fichier.nom} » n'est pas d'un type autorisé.`)
  }
}

/**
 * Écrit les fichiers dans le magasin courant et retourne les métadonnées à persister.
 *
 * Les noms de fichiers sont générés (ULID) et jamais dérivés du nom fourni par l'utilisateur :
 * un nom d'origine peut contenir des séparateurs de chemin ou une extension trompeuse.
 *
 * Le magasin retenu est enregistré sur chaque ligne (`disque`) : une pièce écrite sur disque
 * reste lisible après un basculement vers le stockage objet.
 */
export async function stockerFichiers(
  fichiers: readonly FichierAValider[],
  typeParent: string,
  idParent: string
): Promise<PieceJointePreparee[]> {
  await verifierLot(fichiers)

  const dossierRelatif = path.posix.join('pieces-jointes', typeParent, idParent)
  const magasin = magasinCourant()

  const preparees: PieceJointePreparee[] = []

  for (const fichier of fichiers) {
    const extension = extensionDe(fichier.nom)
    const nomGenere = `${ulid().toLowerCase()}.${extension}`
    const cheminRelatif = path.posix.join(dossierRelatif, nomGenere)

    await magasin.ecrire(cheminRelatif, fichier.octets)

    preparees.push({
      id: ulid().toLowerCase(),
      disque: magasin.nom,
      chemin: cheminRelatif,
      nomOriginal: fichier.nom,
      mimeType: TYPES_AUTORISES[extension],
      tailleOctets: fichier.octets.byteLength,
      checksumSha256: createHash('sha256').update(fichier.octets).digest('hex'),
      octets: fichier.octets,
    })
  }

  return preparees
}

/** Identifiant opaque utilisé pour les noms de fichiers temporaires (tests, imports). */
export function identifiantTemporaire(): string {
  return randomUUID()
}
