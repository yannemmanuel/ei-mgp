import { describe, expect, it } from 'vitest'
import {
  COTE_MAX,
  dimensionsCibles,
  estCompressible,
  renommer,
} from '../compression-images'
import { TYPES_AUTORISES } from '@/server/services/declaration/pieces-jointes'
import { formatApercu } from '../apercu-pieces-jointes'

/**
 * Ce qui est testé ici, c'est la DÉCISION : quels fichiers sont réduits, à quelles dimensions,
 * sous quel nom. L'encodage lui-même appartient au navigateur — ni `createImageBitmap` ni
 * l'écriture WebP d'un canvas n'existent sous jsdom — et `compresserImage()` y rend simplement le
 * fichier inchangé. Ce repli est d'ailleurs le comportement voulu partout où le décodage échoue.
 */
describe('Choix des fichiers à réduire', () => {
  it('réduit les photos, qui sont l’essentiel du poids déposé', () => {
    expect(estCompressible('image/jpeg')).toBe(true)
    expect(estCompressible('image/png')).toBe(true)
    expect(estCompressible('image/webp')).toBe(true)
  })

  it('LAISSE INTACT un GIF — un canvas n’en retiendrait que la première image', () => {
    // Le « compresser » détruirait l'animation, c'est-à-dire l'information que la pièce apporte.
    expect(estCompressible('image/gif')).toBe(false)
  })

  it('laisse intacts les formats qu’un navigateur ne ré-encode pas correctement', () => {
    expect(estCompressible('video/mp4')).toBe(false)
    expect(estCompressible('video/quicktime')).toBe(false)
    expect(estCompressible('application/pdf')).toBe(false)
  })

  it('ne réduit que des types acceptés au téléversement', () => {
    // Anti-dérive : produire un format que le serveur refuserait transformerait la réduction en
    // rejet — la pièce serait perdue au dépôt, ce qui est pire que de la déposer trop lourde.
    const acceptes = Object.values(TYPES_AUTORISES)

    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(acceptes, `${mime} réduit mais non accepté`).toContain(mime)
    }
  })
})

describe('Dimensions cibles', () => {
  it('ramène le plus grand côté à la borne, à proportions conservées', () => {
    // Une photo de téléphone typique, en paysage.
    expect(dimensionsCibles(4032, 3024)).toEqual({ largeur: COTE_MAX, hauteur: 1500 })
  })

  it('traite le portrait comme le paysage — c’est le PLUS GRAND côté qui décide', () => {
    expect(dimensionsCibles(3024, 4032)).toEqual({ largeur: 1500, hauteur: COTE_MAX })
  })

  it('n’AGRANDIT jamais une image déjà petite', () => {
    // Inventer des pixels qui n'ont pas été photographiés alourdirait le dépôt sans rien apporter.
    expect(dimensionsCibles(800, 600)).toEqual({ largeur: 800, hauteur: 600 })
    expect(dimensionsCibles(COTE_MAX, 10)).toEqual({ largeur: COTE_MAX, hauteur: 10 })
  })

  it('ne réduit jamais un côté à zéro, qu’un canvas refuserait', () => {
    const { hauteur } = dimensionsCibles(40_000, 5)

    expect(hauteur).toBeGreaterThanOrEqual(1)
  })
})

describe('Nom du fichier déposé', () => {
  it('suit le format réellement produit', () => {
    // Le serveur confronte l'extension au type réel des octets : un `.jpg` contenant du WebP
    // serait refusé au dépôt.
    expect(renommer('IMG_0421.jpg', 'webp')).toBe('IMG_0421.webp')
    expect(renommer('constat.jpeg', 'jpg')).toBe('constat.jpg')
  })

  it('conserve les points du nom, et n’ampute que l’extension', () => {
    expect(renommer('atelier 3.rev.2.png', 'webp')).toBe('atelier 3.rev.2.webp')
  })

  it('produit toujours un nom exploitable', () => {
    expect(renommer('', 'webp')).toBe('image.webp')
    expect(renommer('.jpg', 'webp')).toBe('image.webp')
  })

  it('produit un format que le tableau de bord sait prévisualiser', () => {
    // La chaîne complète doit tenir : réduire une pièce ne doit pas la rendre inaffichable.
    expect(formatApercu('image/webp')).toBe('image')
    expect(formatApercu('image/jpeg')).toBe('image')
  })
})
