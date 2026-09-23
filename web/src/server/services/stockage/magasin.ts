import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Stockage des pièces jointes.
 *
 * L'hébergement est serverless : le système de fichiers y est en lecture seule hors `/tmp`,
 * lui-même éphémère. D'où cette abstraction — le magasin retenu est enregistré dans
 * `pieces_jointes.disque`, si bien qu'une pièce écrite hier reste lisible si le défaut change.
 *
 * ⚠️ Aucun fichier n'est servi par une URL de stockage directe (`exigences-securite.md` §3) : la
 * lecture passe par une route qui revérifie la Policy du dossier parent.
 */
export type NomMagasin = 'local' | 'blobs'

export interface MagasinFichiers {
  readonly nom: NomMagasin
  ecrire(chemin: string, octets: Buffer): Promise<void>
  lire(chemin: string): Promise<Buffer>
  /**
   * Efface un fichier. **IDEMPOTENT** : un fichier déjà absent n'est pas une erreur.
   *
   * ⚠️ Seul appelant : l'anonymisation RGPD. Aucune suppression de pièce n'est offerte aux
   * utilisateurs — ne pas ouvrir ce geste ailleurs sans une raison écrite.
   *
   * ⚠️ L'idempotence est NÉCESSAIRE : l'anonymisation ne marque un dossier traité que si toutes
   * ses pièces sont parties, donc une exécution interrompue est rejouée sur des fichiers déjà
   * absents. Lever alors bloquerait définitivement le dossier, effacé pour moitié.
   */
  supprimer(chemin: string): Promise<void>
  /**
   * Inventaire du magasin, pour le ramasse-miettes des fichiers orphelins.
   *
   * ⚠️ `modifieLe` PEUT ÊTRE NULL, et ce n'est pas un détail. Le ramasse-miettes n'efface QUE ce
   * dont il peut prouver l'ancienneté : un fichier écrit il y a dix secondes par une transaction
   * encore en cours n'est référencé par aucune ligne, et le supprimer détruirait une pièce
   * jointe en train d'être déposée. Sans date, l'âge est indémontrable — le fichier est donc
   * signalé, jamais effacé.
   */
  lister(): Promise<readonly FichierStocke[]>
}

/** Une entrée d'inventaire. `modifieLe` est nul quand le magasin ne sait pas la donner. */
export type FichierStocke = {
  readonly chemin: string
  readonly modifieLe: Date | null
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

  // `force` rend l'effacement idempotent : un fichier absent ne lève pas. Voir l'interface.
  async supprimer(chemin: string): Promise<void> {
    await rm(this.absolu(chemin), { force: true })
  }

  /**
   * Parcourt la racine. Le disque porte la date de modification : l'âge est donc toujours
   * démontrable ici, contrairement au magasin d'objets.
   */
  async lister(): Promise<readonly FichierStocke[]> {
    const racine = /*turbopackIgnore: true*/ RACINE_LOCALE
    const trouves: FichierStocke[] = []

    const parcourir = async (dossier: string, prefixe: string): Promise<void> => {
      let entrees
      try {
        entrees = await readdir(dossier, { withFileTypes: true })
      } catch {
        // Racine absente : magasin vide, pas une erreur.
        return
      }

      for (const entree of entrees) {
        const complet = path.join(dossier, entree.name)
        const relatif = prefixe ? `${prefixe}/${entree.name}` : entree.name

        if (entree.isDirectory()) {
          await parcourir(complet, relatif)
          continue
        }

        trouves.push({ chemin: relatif, modifieLe: (await stat(complet)).mtime })
      }
    }

    await parcourir(racine, '')
    return trouves
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

    /*
      ⚠️ LA DATE EST ÉCRITE ICI PARCE QUE LE MAGASIN D'OBJETS NE LA DONNE PAS.

      Netlify Blobs ne renvoie ni date de création ni date de modification : un fichier orphelin
      y est donc d'âge indémontrable, et le ramasse-miettes refuse d'effacer ce dont il ne peut
      pas prouver l'ancienneté. Sans cette métadonnée, il ne nettoierait jamais rien en
      production — c'est-à-dire exactement là où il sert.

      Les fichiers écrits AVANT cette date n'en ont pas : ils seront signalés, jamais effacés.
      C'est le bon défaut — on ne devine pas l'âge d'une pièce jointe.
    */
    await (await this.store()).set(normaliser(chemin), tampon, {
      metadata: { televerseLe: new Date().toISOString() },
    })
  }

  async lire(chemin: string): Promise<Buffer> {
    const contenu = await (await this.store()).get(normaliser(chemin), { type: 'arrayBuffer' })

    if (!contenu) {
      throw new Error(`Pièce jointe introuvable dans le magasin d'objets : ${chemin}`)
    }

    return Buffer.from(contenu)
  }

  // `delete` de Netlify Blobs est déjà idempotent : effacer une clé absente ne lève pas.
  async supprimer(chemin: string): Promise<void> {
    await (await this.store()).delete(normaliser(chemin))
  }

  /**
   * Inventaire du magasin d'objets.
   *
   * ⚠️ LA DATE VIENT DE LA MÉTADONNÉE QUE `ecrire()` POSE, pas du magasin : Netlify Blobs
   * n'expose aucune date. Un fichier écrit avant l'introduction de cette métadonnée rend donc
   * `modifieLe: null`, et le ramasse-miettes le signalera sans y toucher.
   *
   * `list({ paginate })` évite de charger des dizaines de milliers de clés d'un coup.
   */
  async lister(): Promise<readonly FichierStocke[]> {
    const store = await this.store()
    const trouves: FichierStocke[] = []

    for await (const page of store.list({ paginate: true })) {
      for (const blob of page.blobs) {
        // `getMetadata` rend `null` pour une clé disparue entre la liste et cette lecture.
        const entree = await store.getMetadata(blob.key)
        const brut = entree?.metadata?.televerseLe

        const modifieLe =
          typeof brut === 'string' && !Number.isNaN(Date.parse(brut)) ? new Date(brut) : null

        trouves.push({ chemin: blob.key, modifieLe })
      }
    }

    return trouves
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
