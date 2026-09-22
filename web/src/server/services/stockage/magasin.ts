import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Stockage des pièces jointes.
 *
 * Le dispositif précédent écrivait sur un disque local. Celui-ci est
 * destiné à un hébergement serverless, où **le système de fichiers est en lecture seule** hors
 * `/tmp`, lui-même éphémère : une écriture y échouerait, et un fichier écrit disparaîtrait à
 * l'invocation suivante.
 *
 * D'où cette abstraction. Le magasin retenu est enregistré dans `pieces_jointes.disque`, colonne
 * qui existait déjà pour cet usage — une pièce écrite hier reste donc lisible même si le magasin
 * par défaut change demain.
 *
 * ⚠️ Aucun fichier n'est jamais servi par une URL de stockage directe
 * (`docs/exigences-securite.md` §3) : la lecture passe par une route qui revérifie la Policy du
 * dossier parent.
 */
export type NomMagasin = 'local' | 'blobs'

export interface MagasinFichiers {
  readonly nom: NomMagasin
  ecrire(chemin: string, octets: Buffer): Promise<void>
  lire(chemin: string): Promise<Buffer>
}

/** Racine du magasin local, HORS du dossier public. */
const RACINE_LOCALE = process.env.STOCKAGE_RACINE ?? path.join(process.cwd(), 'storage', 'private')

/**
 * Normalise un chemin enregistré en base.
 *
 * ⚠️ CETTE CONVERSION DOIT SURVIVRE AU NETTOYAGE, et c'est pour cela qu'elle est commentée ici.
 * Le dossier de rangement d'une pièce dérive du type de son parent ; celui-ci était un nom de
 * classe PHP porteur d'ANTISLASHS, et les vingt pièces déjà écrites portent donc un `chemin` de
 * la forme `pieces-jointes/App\Models\Dossier/<id>/<fichier>`. Windows lit ces antislashs comme
 * des séparateurs, Linux non.
 *
 * Le type s'écrit `dossier` depuis le 2026-09-22 : les pièces NOUVELLES n'en contiennent plus.
 * Mais `chemin` est stocké ligne par ligne et n'a pas été réécrit — déplacer des fichiers pour
 * une question de vocabulaire aurait mis en jeu les pièces elles-mêmes. Supprimer cette fonction
 * rendrait donc introuvable tout ce qui a été déposé avant cette date.
 */
function normaliser(chemin: string): string {
  return chemin.split('\\').join('/')
}

export class MagasinLocal implements MagasinFichiers {
  readonly nom = 'local' as const

  async ecrire(chemin: string, octets: Buffer): Promise<void> {
    const absolu = this.absolu(chemin)

    await mkdir(path.dirname(absolu), { recursive: true })
    await writeFile(absolu, octets)
  }

  async lire(chemin: string): Promise<Buffer> {
    return readFile(this.absolu(chemin))
  }

  /**
   * `turbopackIgnore` : ce sont des chemins de STOCKAGE construits à l'exécution, pas des modules
   * à résoudre. Sans ce marqueur, Turbopack parcourt tout le projet à la recherche d'un import
   * dynamique qui n'existe pas.
   */
  private absolu(chemin: string): string {
    return path.join(/*turbopackIgnore: true*/ RACINE_LOCALE, normaliser(chemin))
  }
}

/**
 * Netlify Blobs — stockage objet, seul viable en serverless.
 *
 * L'import est DYNAMIQUE : hors Netlify la bibliothèque n'a pas de contexte de site et son
 * chargement échouerait au démarrage, alors même que le magasin local suffit en développement.
 */
export class MagasinBlobs implements MagasinFichiers {
  readonly nom = 'blobs' as const

  private async store() {
    const { getStore } = await import('@netlify/blobs')

    return getStore({ name: 'pieces-jointes', consistency: 'strong' })
  }

  async ecrire(chemin: string, octets: Buffer): Promise<void> {
    // L'API accepte un `ArrayBuffer`. Un `Buffer` Node partage souvent un tampon bien plus grand
    // que le fichier : la découpe ci-dessous n'en extrait que les octets utiles.
    const tampon = octets.buffer.slice(
      octets.byteOffset,
      octets.byteOffset + octets.byteLength
    ) as ArrayBuffer

    await (await this.store()).set(normaliser(chemin), tampon)
  }

  async lire(chemin: string): Promise<Buffer> {
    const contenu = await (await this.store()).get(normaliser(chemin), { type: 'arrayBuffer' })

    if (!contenu) {
      throw new Error(`Pièce jointe introuvable dans le magasin d'objets : ${chemin}`)
    }

    return Buffer.from(contenu)
  }
}

const magasins: Record<NomMagasin, MagasinFichiers> = {
  local: new MagasinLocal(),
  blobs: new MagasinBlobs(),
}

/**
 * Magasin utilisé pour les NOUVELLES pièces.
 *
 * `STOCKAGE_MAGASIN` tranche explicitement ; à défaut, la présence de `NETLIFY` fait foi. Écrire
 * sur disque en serverless échouerait à la première déclaration comportant une pièce jointe :
 * mieux vaut que le défaut suive l'environnement plutôt qu'une valeur oubliée.
 */
export function magasinCourant(): MagasinFichiers {
  const choisi = process.env.STOCKAGE_MAGASIN

  if (choisi === 'local' || choisi === 'blobs') return magasins[choisi]

  return process.env.NETLIFY ? magasins.blobs : magasins.local
}

/** Magasin d'une pièce DÉJÀ écrite, désigné par sa colonne `disque`. */
export function magasinNomme(nom: string): MagasinFichiers {
  if (nom === 'local' || nom === 'blobs') return magasins[nom]

  throw new Error(`Magasin de fichiers inconnu : « ${nom} ».`)
}
