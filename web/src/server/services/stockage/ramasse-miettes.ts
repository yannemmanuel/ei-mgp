import { prisma } from '@/lib/prisma'
import { magasinCourant, type FichierStocke } from './magasin'

/**
 * Efface du magasin les fichiers que plus aucune ligne ne désigne.
 *
 * ⚠️ CES ORPHELINS NE SONT PAS UN ACCIDENT : ILS SONT LA CONTREPARTIE D'UN CHOIX.
 * `creer-declaration.ts` écrit les fichiers À L'INTÉRIEUR de la transaction, avant d'insérer
 * leurs lignes. Un `ROLLBACK` après ce point annule les lignes et laisse les fichiers.
 *
 * L'ordre inverse serait pire : il laisserait une ligne promettant un fichier qui n'existe pas —
 * une pièce jointe visible dans la fiche, introuvable au téléchargement, et dont personne ne
 * saurait dire ce qu'elle contenait. Mieux vaut un fichier de trop, qu'on sait retrouver, qu'une
 * ligne qui ment. D'où ce ramasse-miettes : il assume la conséquence plutôt que de la nier.
 *
 * ⚠️ IL N'EFFACE QUE CE DONT IL PEUT PROUVER L'ÂGE. Un fichier écrit il y a dix secondes n'est
 * référencé par aucune ligne tant que la transaction n'a pas commité : le supprimer détruirait
 * une pièce jointe en cours de dépôt, sur un dossier parfaitement valide. Le délai de grâce
 * écarte ce cas, et un fichier sans date connue est SIGNALÉ, jamais effacé.
 */

/**
 * Âge minimal d'un fichier avant qu'il puisse être considéré comme orphelin.
 *
 * ⚠️ C'EST LE SEUL GARDE-FOU ENTRE CE TRAITEMENT ET LA PERTE DE PIÈCES JOINTES VALIDES. Vingt-
 * quatre heures est très au-delà de ce qu'une transaction peut durer — quelques secondes au
 * pire — et le coût de l'attente est nul : un fichier orphelin ne gêne personne pendant un jour.
 * Le réduire ne fait gagner que de l'espace disque, et risque une pièce jointe réelle.
 */
const GRACE_HEURES = 24

export type ResultatRamassage = {
  /** Fichiers effacés. */
  readonly effaces: number
  readonly octetsLiberes: number
  /**
   * Orphelins laissés en place faute de pouvoir prouver leur âge.
   *
   * ⚠️ Durablement non nul, ce chiffre signale des fichiers antérieurs à l'inscription de la
   * date de téléversement. Ils ne partiront jamais d'eux-mêmes : c'est une décision à prendre à
   * la main, en les regardant.
   */
  readonly ageInconnu: number
  /** Orphelins encore dans le délai de grâce : repris au prochain passage. */
  readonly tropRecents: number
}

/** `chemin` est stocké avec des antislashs pour les pièces d'avant la migration. */
function normaliser(chemin: string): string {
  return chemin.split('\\').join('/')
}

export async function ramasserFichiersOrphelins(
  maintenant: Date = new Date()
): Promise<ResultatRamassage> {
  const magasin = magasinCourant()

  /*
    ⚠️ LES LIGNES SONT LUES AVANT L'INVENTAIRE DU MAGASIN, et l'ordre compte.

    Dans l'autre sens, un fichier écrit entre l'inventaire et la lecture des lignes aurait été vu
    par l'un et pas par l'autre — donc pris pour un orphelin. Ici, une ligne créée entre les deux
    lectures désigne un fichier que l'inventaire n'a pas encore vu : il est simplement ignoré,
    ce qui est sans conséquence.

    ⚠️ TOUTES les lignes, sans filtrer sur `disque` : une pièce écrite hier sur un autre magasin
    reste une pièce référencée, et son chemin ne doit pas être considéré comme libre.
  */
  const lignes = await prisma.pieces_jointes.findMany({ select: { chemin: true } })
  const references = new Set(lignes.map((l) => normaliser(l.chemin)))

  const inventaire = await magasin.lister()

  const orphelins = inventaire.filter((f) => !references.has(normaliser(f.chemin)))

  const limite = new Date(maintenant.getTime() - GRACE_HEURES * 3600 * 1000)

  let effaces = 0
  let octetsLiberes = 0
  let ageInconnu = 0
  let tropRecents = 0

  for (const fichier of orphelins) {
    if (fichier.modifieLe === null) {
      ageInconnu += 1
      continue
    }

    if (fichier.modifieLe > limite) {
      tropRecents += 1
      continue
    }

    // La taille est relevée AVANT l'effacement : après, il n'y a plus rien à mesurer.
    octetsLiberes += await tailleOu0(magasin, fichier)
    await magasin.supprimer(fichier.chemin)
    effaces += 1
  }

  return { effaces, octetsLiberes, ageInconnu, tropRecents }
}

/**
 * Taille d'un fichier, ou 0 si elle n'a pas pu être lue.
 *
 * Le décompte d'octets sert à rendre compte, pas à décider : un fichier illisible doit quand même
 * être effacé, et l'échec de la mesure ne doit pas interrompre le ramassage.
 */
async function tailleOu0(
  magasin: { lire(chemin: string): Promise<Buffer> },
  fichier: FichierStocke
): Promise<number> {
  try {
    return (await magasin.lire(fichier.chemin)).byteLength
  } catch {
    return 0
  }
}
