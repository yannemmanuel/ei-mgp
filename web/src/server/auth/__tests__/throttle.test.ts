import { beforeEach, describe, expect, it } from 'vitest'
import {
  autoriserTentative,
  cleThrottle,
  reinitialiserTentatives,
  viderThrottle,
} from '../throttle'

/**
 * Équivalent de `RateLimiter::for('login')` (Laravel) : 5 tentatives par minute et par couple
 * e-mail + IP.
 */
describe('Limitation des tentatives de connexion', () => {
  beforeEach(() => viderThrottle())

  it('autorise 5 tentatives puis bloque la sixième', () => {
    const cle = cleThrottle('a@example.test', '10.0.0.1')

    for (let i = 1; i <= 5; i++) {
      expect(autoriserTentative(cle), `tentative ${i}`).toBe(true)
    }

    expect(autoriserTentative(cle)).toBe(false)
  })

  it('compte séparément deux adresses IP pour le même e-mail', () => {
    const depuisA = cleThrottle('a@example.test', '10.0.0.1')
    const depuisB = cleThrottle('a@example.test', '10.0.0.2')

    for (let i = 0; i < 5; i++) autoriserTentative(depuisA)

    expect(autoriserTentative(depuisA)).toBe(false)
    expect(autoriserTentative(depuisB)).toBe(true)
  })

  it("ne se laisse pas contourner par une variation de casse de l'e-mail", () => {
    const minuscules = cleThrottle('a@example.test', '10.0.0.1')
    const majuscules = cleThrottle('A@Example.TEST', '10.0.0.1')

    expect(majuscules).toBe(minuscules)
  })

  it('libère le compteur après la fenêtre d\'une minute', () => {
    const cle = cleThrottle('a@example.test', '10.0.0.1')
    const t0 = Date.now()

    for (let i = 0; i < 5; i++) autoriserTentative(cle, t0)
    expect(autoriserTentative(cle, t0)).toBe(false)

    expect(autoriserTentative(cle, t0 + 60_001)).toBe(true)
  })

  it('remet le compteur à zéro après une connexion réussie', () => {
    const cle = cleThrottle('a@example.test', '10.0.0.1')

    for (let i = 0; i < 5; i++) autoriserTentative(cle)
    expect(autoriserTentative(cle)).toBe(false)

    reinitialiserTentatives(cle)
    expect(autoriserTentative(cle)).toBe(true)
  })
})
