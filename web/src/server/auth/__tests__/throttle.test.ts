import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  autoriserTentative,
  cleThrottle,
  LIMITE_MESSAGERIE,
  purgerDebits,
  reinitialiserTentatives,
  viderThrottle,
} from '../throttle'

/**
 * Limitation de débit — équivalent de `RateLimiter::for('login')` (Laravel) : 5 tentatives par
 * minute et par couple e-mail + IP.
 *
 * Les compteurs vivent en base : ces tests s'exécutent donc contre le magasin réel, seul moyen de
 * vérifier ce qui compte vraiment ici — l'atomicité de l'incrément et le partage entre instances.
 */
beforeEach(async () => {
  await viderThrottle()
})

afterAll(async () => {
  await viderThrottle()
  await prisma.$disconnect()
})

describe('Comptage', () => {
  it('autorise 5 tentatives puis bloque la sixième', async () => {
    const cle = cleThrottle('a@example.test', '10.0.0.1')

    for (let i = 1; i <= 5; i++) {
      expect(await autoriserTentative(cle), `tentative ${i}`).toBe(true)
    }

    expect(await autoriserTentative(cle)).toBe(false)
  })

  it('compte séparément deux adresses IP pour le même e-mail', async () => {
    const depuisA = cleThrottle('a@example.test', '10.0.0.1')
    const depuisB = cleThrottle('a@example.test', '10.0.0.2')

    for (let i = 0; i < 5; i++) await autoriserTentative(depuisA)

    expect(await autoriserTentative(depuisA)).toBe(false)
    expect(await autoriserTentative(depuisB)).toBe(true)
  })

  it('ne se laisse pas contourner par une variation de casse', async () => {
    // La casse peut varier des deux côtés : l'e-mail est en première position à la connexion,
    // la référence de dossier en seconde au suivi.
    expect(cleThrottle('A@Example.TEST', '10.0.0.1')).toBe(
      cleThrottle('a@example.test', '10.0.0.1')
    )
    expect(cleThrottle('suivi-ref', 'EI-2026-000001')).toBe(
      cleThrottle('suivi-ref', 'ei-2026-000001')
    )
  })

  it('applique la limite propre à la messagerie publique', async () => {
    const cle = cleThrottle('messagerie-envoi', '10.0.0.9')

    for (let i = 1; i <= LIMITE_MESSAGERIE.maxTentatives; i++) {
      expect(await autoriserTentative(cle, Date.now(), LIMITE_MESSAGERIE), `envoi ${i}`).toBe(true)
    }

    expect(await autoriserTentative(cle, Date.now(), LIMITE_MESSAGERIE)).toBe(false)
  })
})

describe('Fenêtre glissante', () => {
  it('repart à zéro une fois la fenêtre écoulée', async () => {
    const cle = cleThrottle('b@example.test', '10.0.0.3')
    const depart = Date.now()

    for (let i = 0; i < 5; i++) await autoriserTentative(cle, depart)
    expect(await autoriserTentative(cle, depart)).toBe(false)

    // Une minute plus tard : la fenêtre est close, le compteur repart.
    expect(await autoriserTentative(cle, depart + 61_000)).toBe(true)
  })

  it('ne prolonge pas la fenêtre à chaque tentative', async () => {
    const cle = cleThrottle('c@example.test', '10.0.0.4')
    const depart = Date.now()

    // Tentatives étalées : sans fenêtre fixe, un attaquant patient repousserait indéfiniment
    // l'expiration et ne serait jamais bloqué.
    for (let i = 0; i < 5; i++) await autoriserTentative(cle, depart + i * 10_000)

    expect(await autoriserTentative(cle, depart + 50_000)).toBe(false)
    expect(await autoriserTentative(cle, depart + 61_000)).toBe(true)
  })
})

describe('Réinitialisation', () => {
  it('efface le compteur après une opération réussie', async () => {
    const cle = cleThrottle('d@example.test', '10.0.0.5')

    for (let i = 0; i < 5; i++) await autoriserTentative(cle)
    expect(await autoriserTentative(cle)).toBe(false)

    await reinitialiserTentatives(cle)

    expect(await autoriserTentative(cle)).toBe(true)
  })
})

describe('Partage entre instances', () => {
  it('persiste le compteur hors du processus', async () => {
    const cle = cleThrottle('e@example.test', '10.0.0.6')

    for (let i = 0; i < 3; i++) await autoriserTentative(cle)

    // Lu directement en base : c'est ce qui permet à une seconde instance de voir le même
    // compteur. Un compteur en mémoire se contournerait en frappant l'autre instance.
    const ligne = await prisma.cache.findUniqueOrThrow({ where: { key: cle } })
    expect(Number(ligne.value)).toBe(3)
  })

  it('résiste à des tentatives simultanées', async () => {
    const cle = cleThrottle('f@example.test', '10.0.0.7')

    // Dix incréments lancés ensemble : un SELECT suivi d'un UPDATE en perdrait, et laisserait
    // passer plus de tentatives que la limite.
    const resultats = await Promise.all(
      Array.from({ length: 10 }, () => autoriserTentative(cle))
    )

    expect(resultats.filter(Boolean)).toHaveLength(5)

    const ligne = await prisma.cache.findUniqueOrThrow({ where: { key: cle } })
    expect(Number(ligne.value)).toBe(10)
  })
})

describe('Purge', () => {
  it('retire les compteurs expirés et laisse les autres', async () => {
    const ancien = cleThrottle('g@example.test', '10.0.0.8')
    const recent = cleThrottle('h@example.test', '10.0.0.8')
    const depart = Date.now()

    await autoriserTentative(ancien, depart - 120_000)
    await autoriserTentative(recent, depart)

    expect(await purgerDebits(depart)).toBe(1)

    expect(await prisma.cache.findUnique({ where: { key: ancien } })).toBeNull()
    expect(await prisma.cache.findUnique({ where: { key: recent } })).not.toBeNull()
  })
})
