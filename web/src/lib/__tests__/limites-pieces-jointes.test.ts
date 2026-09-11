import { describe, expect, it } from 'vitest'
import {
  MAX_FICHIERS,
  MAX_OCTETS_TOTAL,
  MESSAGE_LOT_TROP_LOURD,
  MESSAGE_TROP_DE_FICHIERS,
  verifierLotSuperficiellement,
} from '../limites-pieces-jointes'

/**
 * EX-DEC-06 / RGI-04, versant navigateur.
 *
 * Les mêmes bornes sont vérifiées côté serveur par `verifierLot()` (non-regression.test.ts) : ce
 * qui est testé ici, c'est qu'elles refusent AVANT l'envoi ce que le serveur refuserait après.
 */
describe('Bornes des pièces jointes annoncées au déclarant', () => {
  const piece = (octets: number) => ({ size: octets })

  it('accepte un lot vide — les pièces jointes restent facultatives', () => {
    expect(verifierLotSuperficiellement([])).toBeNull()
  })

  it('accepte exactement 10 fichiers, refuse le onzième', () => {
    expect(verifierLotSuperficiellement(Array.from({ length: MAX_FICHIERS }, () => piece(1)))).toBeNull()
    expect(
      verifierLotSuperficiellement(Array.from({ length: MAX_FICHIERS + 1 }, () => piece(1)))
    ).toBe(MESSAGE_TROP_DE_FICHIERS)
  })

  it('pèse le TOTAL, pas chaque fichier séparément', () => {
    const moitie = piece(MAX_OCTETS_TOTAL / 2)

    expect(verifierLotSuperficiellement([moitie, moitie])).toBeNull()
    expect(verifierLotSuperficiellement([moitie, piece(MAX_OCTETS_TOTAL / 2 + 1)])).toBe(
      MESSAGE_LOT_TROP_LOURD
    )
  })
})
