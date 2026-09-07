import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { MagasinLocal, magasinCourant, magasinNomme } from '../magasin'

/**
 * Stockage des pièces jointes.
 *
 * Le point qui compte : le magasin est choisi par l'ENVIRONNEMENT, et le magasin d'une pièce
 * déjà écrite est celui enregistré sur sa ligne. Sans cette distinction, un basculement vers le
 * stockage objet rendrait illisibles toutes les pièces antérieures.
 */
const RACINE = process.env.STOCKAGE_RACINE ?? path.join(process.cwd(), 'storage', 'private')
const CHEMIN_TEST = 'pieces-jointes/test-magasin/exemple.bin'

const variables = ['STOCKAGE_MAGASIN', 'NETLIFY'] as const
const initial = Object.fromEntries(variables.map((v) => [v, process.env[v]]))

afterEach(async () => {
  for (const v of variables) {
    if (initial[v] === undefined) delete process.env[v]
    else process.env[v] = initial[v]
  }

  await rm(path.join(RACINE, 'pieces-jointes', 'test-magasin'), { recursive: true, force: true })
})

describe('Choix du magasin', () => {
  it('écrit sur disque hors serverless', () => {
    delete process.env.STOCKAGE_MAGASIN
    delete process.env.NETLIFY

    expect(magasinCourant().nom).toBe('local')
  })

  it('bascule sur le stockage objet quand l’hébergement est serverless', () => {
    delete process.env.STOCKAGE_MAGASIN
    process.env.NETLIFY = 'true'

    // Écrire sur disque y échouerait à la première déclaration comportant une pièce jointe.
    expect(magasinCourant().nom).toBe('blobs')
  })

  it('laisse la configuration primer sur la détection', () => {
    process.env.NETLIFY = 'true'
    process.env.STOCKAGE_MAGASIN = 'local'

    expect(magasinCourant().nom).toBe('local')
  })

  it('ignore une valeur de configuration inconnue', () => {
    delete process.env.NETLIFY
    process.env.STOCKAGE_MAGASIN = 'ftp'

    expect(magasinCourant().nom).toBe('local')
  })
})

describe('Relecture d’une pièce existante', () => {
  it('résout le magasin par le nom enregistré sur la ligne', () => {
    expect(magasinNomme('local').nom).toBe('local')
    expect(magasinNomme('blobs').nom).toBe('blobs')
  })

  it('refuse un nom de magasin inconnu plutôt que de deviner', () => {
    // Deviner reviendrait à chercher un fichier là où il n'est pas, et à répondre « introuvable »
    // pour une pièce qui existe.
    expect(() => magasinNomme('s3')).toThrow(/inconnu/i)
  })
})

describe('Magasin local', () => {
  it('écrit puis relit exactement les mêmes octets', async () => {
    const magasin = new MagasinLocal()
    const contenu = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x42])

    await magasin.ecrire(CHEMIN_TEST, contenu)

    expect(await magasin.lire(CHEMIN_TEST)).toEqual(contenu)
  })

  it('écrit hors du dossier public', async () => {
    const magasin = new MagasinLocal()
    await magasin.ecrire(CHEMIN_TEST, Buffer.from('contenu'))

    const absolu = path.join(RACINE, CHEMIN_TEST)

    // Aucune pièce ne doit être atteignable par une URL de stockage directe : le fichier vit
    // hors de `public/`, et la lecture passe par une route qui revérifie la Policy.
    expect(await readFile(absolu, 'utf8')).toBe('contenu')
    expect(absolu).not.toContain(`${path.sep}public${path.sep}`)
  })

  it('crée l’arborescence manquante', async () => {
    const magasin = new MagasinLocal()
    const profond = 'pieces-jointes/test-magasin/a/b/c/fichier.bin'

    await expect(magasin.ecrire(profond, Buffer.from('x'))).resolves.toBeUndefined()
    expect(await magasin.lire(profond)).toEqual(Buffer.from('x'))
  })
})
