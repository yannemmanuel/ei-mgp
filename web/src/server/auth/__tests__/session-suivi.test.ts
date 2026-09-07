import { beforeAll, describe, expect, it } from 'vitest'
import { creerJetonSuivi, verifierJetonSuivi } from '../session-suivi'

/**
 * Le jeton de suivi est la SEULE chose qui empêche de lire et d'alimenter la messagerie d'un
 * dossier sans en connaître le code d'accès. Ces cas vérifient qu'il ne cède ni à la
 * falsification, ni au rejeu tardif.
 */
beforeAll(() => {
  process.env.AUTH_SECRET ??= 'secret-de-test-suffisamment-long-pour-hmac'
})

const DOSSIER = '01jw0k7m0000000000000000aa'
const AUTRE = '01jw0k7m0000000000000000bb'
const DANS_UNE_HEURE = () => Date.now() + 3_600_000

describe('Jeton de session de suivi', () => {
  it('reconnaît un jeton qu’il vient d’émettre', () => {
    expect(verifierJetonSuivi(creerJetonSuivi(DOSSIER, DANS_UNE_HEURE()))).toBe(DOSSIER)
  })

  it('rejette un jeton dont l’identifiant de dossier a été remplacé', () => {
    const jeton = creerJetonSuivi(DOSSIER, DANS_UNE_HEURE())
    const falsifie = jeton.replace(DOSSIER, AUTRE)

    // Sans signature, cette substitution donnerait accès au dossier d'autrui.
    expect(falsifie).not.toBe(jeton)
    expect(verifierJetonSuivi(falsifie)).toBeNull()
  })

  it('rejette un jeton dont l’expiration a été repoussée', () => {
    const expiration = DANS_UNE_HEURE()
    const jeton = creerJetonSuivi(DOSSIER, expiration)
    const prolonge = jeton.replace(String(expiration), String(expiration + 86_400_000))

    expect(verifierJetonSuivi(prolonge)).toBeNull()
  })

  it('rejette un jeton expiré, même parfaitement signé', () => {
    const jeton = creerJetonSuivi(DOSSIER, Date.now() - 1)
    expect(verifierJetonSuivi(jeton)).toBeNull()
  })

  it('rejette une valeur qui n’est pas un jeton', () => {
    for (const valeur of ['', '.', DOSSIER, `${DOSSIER}.${DANS_UNE_HEURE()}`, 'a.b.c']) {
      expect(verifierJetonSuivi(valeur)).toBeNull()
    }
  })

  it('n’émet pas de jeton sans secret de signature', () => {
    const secret = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET

    try {
      // Un secret vide produirait une signature constante, donc reproductible par n'importe qui.
      expect(() => creerJetonSuivi(DOSSIER, DANS_UNE_HEURE())).toThrow(/AUTH_SECRET/)
    } finally {
      process.env.AUTH_SECRET = secret
    }
  })
})
