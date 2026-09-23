import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { MODELES } from '@/server/modeles'
import { magasinCourant } from '../magasin'
import { ramasserFichiersOrphelins } from '../ramasse-miettes'

/**
 * Le ramasse-miettes des fichiers orphelins.
 *
 * ⚠️ CE TRAITEMENT EFFACE DES FICHIERS. C'est le seul du projet à le faire hors anonymisation,
 * et une erreur y détruit des pièces jointes que personne ne pourra restituer. Les cas ci-dessous
 * vérifient donc surtout ce qu'il NE FAIT PAS.
 *
 * ⚠️ Le danger n'est pas théorique : `creer-declaration.ts` écrit les fichiers À L'INTÉRIEUR de
 * la transaction, avant d'insérer leurs lignes. Pendant quelques instants, un fichier
 * parfaitement légitime n'est référencé par AUCUNE ligne. Sans le délai de grâce, un ramassage
 * tombant à cet instant supprimerait une pièce jointe en cours de dépôt.
 */
const RACINE_ESSAI = 'essai-ramasse-miettes'

const ecrits: string[] = []
const lignesCreees: string[] = []

const HIER = new Date(Date.now() - 48 * 3600 * 1000)
const MAINTENANT = new Date()

async function ecrire(nom: string): Promise<string> {
  const chemin = `${RACINE_ESSAI}/${nom}`
  await magasinCourant().ecrire(chemin, Buffer.from('contenu de vérification'))
  ecrits.push(chemin)
  return chemin
}

/** Vieillit un fichier du magasin local en reculant sa date de modification. */
async function vieillir(chemin: string): Promise<void> {
  const { utimes } = await import('node:fs/promises')
  const path = await import('node:path')
  const racine = process.env.STOCKAGE_RACINE ?? path.default.join(process.cwd(), 'storage', 'private')

  await utimes(path.default.join(racine, chemin), HIER, HIER)
}

/** Crée une ligne `pieces_jointes` qui DÉSIGNE ce fichier. */
async function referencer(chemin: string): Promise<void> {
  const { ulid } = await import('ulid')
  const id = ulid().toLowerCase()

  await prisma.pieces_jointes.create({
    data: {
      id,
      attachable_type: MODELES.dossier,
      // Un identifiant de dossier qui n'existe pas : ce traitement ne regarde QUE `chemin`,
      // et la ligne n'a pas besoin d'un parent réel pour jouer son rôle ici.
      attachable_id: ulid().toLowerCase(),
      disque: magasinCourant().nom,
      chemin,
      nom_original: 'verification.txt',
      mime_type: 'text/plain',
      taille_octets: BigInt(23),
      checksum_sha256: 'x'.repeat(64),
      created_at: MAINTENANT,
    },
  })

  lignesCreees.push(id)
}

/*
  ⚠️ GARDE-FOU : CE TRAITEMENT BALAIE LE MAGASIN RÉEL.

  Il n'existe pas de magasin d'essai isolé — le tester sur un double ne prouverait rien de
  l'inventaire réel, qui est justement la partie délicate. Mais s'il restait un orphelin ANCIEN
  avant que ces cas ne commencent, le premier ramassage l'effacerait pour de bon, sans que
  personne ne l'ait décidé.

  Le cas échoue donc bruyamment plutôt que de détruire silencieusement. Un orphelin préexistant
  se regarde et se traite à la main ; il ne se fait pas emporter par une suite de tests.
*/
beforeAll(async () => {
  const bilan = await ramasserFichiersOrphelins(new Date(Date.now() - 365 * 24 * 3600 * 1000))

  expect(
    bilan.tropRecents + bilan.ageInconnu,
    'des fichiers orphelins préexistent dans le magasin : les traiter à la main avant de relancer'
  ).toBe(0)
  expect(bilan.effaces, 'le contrôle préalable n’aurait dû rien effacer').toBe(0)
})

afterAll(async () => {
  await prisma.pieces_jointes.deleteMany({ where: { id: { in: lignesCreees } } })

  for (const chemin of ecrits) {
    await magasinCourant().supprimer(chemin)
  }

  /*
    ⚠️ LE RÉPERTOIRE AUSSI. `supprimer()` efface des FICHIERS ; sur le magasin local, le
    répertoire qui les portait reste, vide. Sans conséquence en production — le magasin d'objets
    n'a pas de répertoires, seulement des clés — mais une suite qui en laisse un à chaque
    exécution finit par en semer partout.
  */
  const { rm } = await import('node:fs/promises')
  const path = await import('node:path')
  const racine =
    process.env.STOCKAGE_RACINE ?? path.default.join(process.cwd(), 'storage', 'private')

  await rm(path.default.join(racine, RACINE_ESSAI), { recursive: true, force: true })
})

describe('⚠️ Ce que le ramasse-miettes n’efface PAS', () => {
  it('⚠️ épargne un fichier RÉCENT, même sans ligne qui le désigne', async () => {
    /*
      LE CAS QUI COMPTE. C'est l'état exact d'une pièce jointe entre son écriture et le commit de
      la transaction qui insère sa ligne. L'effacer détruirait une déclaration en cours de dépôt.
    */
    const chemin = await ecrire('recent-sans-ligne.txt')

    const bilan = await ramasserFichiersOrphelins()

    expect(bilan.tropRecents, 'le fichier récent n’a pas été reconnu comme tel').toBeGreaterThan(0)
    await expect(
      magasinCourant().lire(chemin),
      '⚠️ une pièce jointe en cours de dépôt a été EFFACÉE'
    ).resolves.toBeInstanceOf(Buffer)
  })

  it('épargne un vieux fichier qu’une ligne désigne', async () => {
    const chemin = await ecrire('vieux-avec-ligne.txt')
    await vieillir(chemin)
    await referencer(chemin)

    await ramasserFichiersOrphelins()

    await expect(
      magasinCourant().lire(chemin),
      '⚠️ une pièce jointe RÉFÉRENCÉE a été effacée'
    ).resolves.toBeInstanceOf(Buffer)
  })
})

describe('Ce qu’il efface', () => {
  it('⚠️ efface un vieux fichier que plus aucune ligne ne désigne', async () => {
    const chemin = await ecrire('vieux-sans-ligne.txt')
    await vieillir(chemin)

    const bilan = await ramasserFichiersOrphelins()

    expect(bilan.effaces, 'l’orphelin n’a pas été effacé').toBeGreaterThan(0)
    expect(bilan.octetsLiberes, 'aucun octet compté').toBeGreaterThan(0)

    await expect(magasinCourant().lire(chemin)).rejects.toThrow()
  })

  it('est REJOUABLE : un second passage ne trouve plus rien à effacer', async () => {
    const chemin = await ecrire('vieux-a-effacer-deux-fois.txt')
    await vieillir(chemin)

    const premier = await ramasserFichiersOrphelins()
    expect(premier.effaces).toBeGreaterThan(0)

    const second = await ramasserFichiersOrphelins()
    expect(second.effaces, 'le second passage a effacé quelque chose').toBe(0)
  })
})
