import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles, utilisateurDuSite } from '@/server/authz/__tests__/aide'
import { parcoursAutorises, type ParcoursCode } from '@/server/authz'
import { perimetreDossiers } from '../../dossier/liste'
import { filtreDepuisParametres } from '../filtre'
import { ETAPES, progressionParDirection } from '../repartition-directions'

/**
 * La progression par direction du tableau de bord ne compte QUE ce que le lecteur peut ouvrir.
 *
 * Chaque cas recompte indépendamment, avec le périmètre de la liste des dossiers : un chiffre que
 * la liste ne permettrait pas de retrouver serait une fuite. Lecture seule, sur les données réelles.
 */
afterAll(async () => {
  await prisma.$disconnect()
})

describe('Progression par direction', () => {
  it('compte exactement le périmètre de la liste des dossiers, rôle par rôle', async () => {
    for (const role of ['service_mgp', 'secretaire_csst', 'correspondant_mgp'] as const) {
      const u = utilisateurAvecRoles(role)

      const attendu = await prisma.dossiers.count({ where: perimetreDossiers(u) })
      const { lignes, global } = await progressionParDirection(u)

      expect(global.total, role).toBe(attendu)
      expect(lignes.reduce((t, l) => t + l.total, 0), role).toBe(attendu)
    }
  })

  it('découpe chaque direction en étapes dont la somme fait le total', async () => {
    const { lignes, global } = await progressionParDirection(utilisateurAvecRoles('service_mgp'))

    for (const l of [...lignes, global]) {
      expect(ETAPES.reduce((t, { cle }) => t + l.etapes[cle], 0)).toBe(l.total)
      expect(l.ouverts).toBeLessThanOrEqual(l.total)
      expect(l.critiquesOuverts).toBeLessThanOrEqual(l.ouverts)
    }
  })

  it('restreint à un parcours du lecteur, et la somme des parcours fait le global', async () => {
    const u = utilisateurAvecRoles('service_mgp')
    const { global } = await progressionParDirection(u)

    let somme = 0
    for (const code of parcoursAutorises(u)) {
      const parParcours = await progressionParDirection(u, { parcours: code })
      const attendu = await prisma.dossiers.count({
        where: { AND: [perimetreDossiers(u), { parcours: { code } }] },
      })

      expect(parParcours.global.total, code).toBe(attendu)
      somme += parParcours.global.total
    }

    expect(somme).toBe(global.total)
  })

  it('⚠️ ignore un parcours hors habilitation au lieu de l’ouvrir', async () => {
    const u = utilisateurAvecRoles('secretaire_csst')
    const autorises = parcoursAutorises(u)
    const horsPerimetre = (
      await prisma.parcours.findMany({ select: { code: true } })
    ).find((p) => !autorises.includes(p.code as ParcoursCode))

    if (!horsPerimetre) return

    const demande = await progressionParDirection(u, {
      parcours: horsPerimetre.code as ParcoursCode,
    })
    const attendu = await prisma.dossiers.count({ where: perimetreDossiers(u) })

    // Le parcours étranger est sans effet : on retombe sur le périmètre, jamais au-delà.
    expect(demande.global.total).toBe(attendu)
  })

  it('reste dans le périmètre d’un compte borné à un site, même filtré sur un autre site', async () => {
    const sites = await prisma.dossiers.groupBy({
      by: ['site_id'],
      where: { site_id: { not: null } },
      _count: { _all: true },
    })

    if (sites.length < 2) return

    const [site, autre] = sites.map((s) => s.site_id as bigint)
    const u = utilisateurDuSite(site, 'service_mgp')

    const attendu = await prisma.dossiers.count({ where: perimetreDossiers(u) })
    expect((await progressionParDirection(u)).global.total).toBe(attendu)

    const filtree = await progressionParDirection(u, {
      filtre: filtreDepuisParametres({ siteId: String(autre) }, u),
    })
    expect(filtree.global.total).toBeLessThanOrEqual(attendu)
  })

  it('classe les directions par urgence', async () => {
    const { lignes } = await progressionParDirection(utilisateurAvecRoles('service_mgp'))

    for (let i = 1; i < lignes.length; i++) {
      const [a, b] = [lignes[i - 1], lignes[i]]
      expect(
        a.critiquesOuverts > b.critiquesOuverts ||
          (a.critiquesOuverts === b.critiquesOuverts && a.ouverts >= b.ouverts),
        `${a.libelle} devrait précéder ${b.libelle}`
      ).toBe(true)
    }
  })
})
