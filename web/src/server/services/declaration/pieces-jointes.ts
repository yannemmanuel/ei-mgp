import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { ulid } from 'ulid'

/**
 * EX-DEC-06 / RGI-04 : 5 fichiers maximum, 50 Mo au total par déclaration.
 *
 * Port de `App\Services\Declaration\PieceJointeUploadService`. Le type RÉEL de chaque fichier
 * est revérifié à partir de ses octets d'en-tête (équivalent de `finfo` côté PHP) : le type MIME
 * annoncé par le navigateur n'est jamais une preuve suffisante
 * (docs/exigences-securite.md §3).
 */
export const MAX_FICHIERS = 5
export const MAX_OCTETS_TOTAL = 50 * 1024 * 1024

/** Extension attendue → type MIME réel accepté. Repris à l'identique du service Laravel. */
const TYPES_AUTORISES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
}

/** Racine de stockage, HORS du dossier public : aucun fichier n'est servi en direct. */
const RACINE_STOCKAGE = process.env.STOCKAGE_RACINE ?? path.join(process.cwd(), 'storage', 'private')

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
 * sans ses pièces jointes (même ordre que le service Laravel).
 */
export async function verifierLot(fichiers: readonly FichierAValider[]): Promise<void> {
  if (fichiers.length > MAX_FICHIERS) {
    throw new ErreurPieceJointe(`Un maximum de ${MAX_FICHIERS} fichiers est autorisé par déclaration.`)
  }

  const tailleTotale = fichiers.reduce((somme, f) => somme + f.octets.byteLength, 0)

  if (tailleTotale > MAX_OCTETS_TOTAL) {
    throw new ErreurPieceJointe('La taille totale des pièces jointes dépasse 50 Mo.')
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
 * Écrit les fichiers sur le disque privé et retourne les métadonnées à persister.
 *
 * Les noms de fichiers sont générés (ULID) et jamais dérivés du nom fourni par l'utilisateur :
 * un nom d'origine peut contenir des séparateurs de chemin ou une extension trompeuse.
 */
export async function stockerFichiers(
  fichiers: readonly FichierAValider[],
  typeParent: string,
  idParent: string
): Promise<PieceJointePreparee[]> {
  await verifierLot(fichiers)

  const dossierRelatif = path.posix.join('pieces-jointes', typeParent, idParent)
  // `turbopackIgnore` : ce sont des chemins de STOCKAGE construits a l'execution, pas des
  // modules a resoudre. Sans ce marqueur, Turbopack trace tout le projet a la recherche d'un
  // import dynamique qui n'existe pas.
  const dossierAbsolu = path.join(/*turbopackIgnore: true*/ RACINE_STOCKAGE, dossierRelatif)
  await mkdir(dossierAbsolu, { recursive: true })

  const preparees: PieceJointePreparee[] = []

  for (const fichier of fichiers) {
    const extension = extensionDe(fichier.nom)
    const nomGenere = `${ulid().toLowerCase()}.${extension}`
    const cheminRelatif = path.posix.join(dossierRelatif, nomGenere)

    await writeFile(path.join(/*turbopackIgnore: true*/ dossierAbsolu, nomGenere), fichier.octets)

    preparees.push({
      id: ulid().toLowerCase(),
      disque: 'local',
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
