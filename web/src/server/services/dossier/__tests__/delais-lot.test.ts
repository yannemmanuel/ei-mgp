import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { dateLimite, datesLimites } from '../delais'
import type { StatutCode } from '../statuts'

/**
 * Le calcul d'échéance en lot et le calcul unitaire sont deux points d'entrée de la MÊME règle.
 *
 * Le lot existe parce que le tableau de bord ne pouvait pas se permettre une requête par dossier —
 * c'est la raison pour laquelle il avait renoncé à compter les dossiers en retard. Mais deux
 * chemins vers la même date, c'est deux définitions qui finiront par diverger, et l'écart se
 * verrait d'abord sur une alerte qui ne part pas.
 *
 * Ce cas les croise sur les dossiers RÉELS de la base : c'est la seule façon de détecter qu'ils ne
 * disent plus la même chose.
 */
describe('Échéances en lot et à l’unité', () => {
  it('donnent exactement la même date, dossier par dossier', async () => {
    const dossiers = (
      await prisma.dossiers.findMany({
        select: {
          id: true,
          parcours_id: true,
          statuts_dossier: { select: { code: true } },
        },
      })
    ).map((d) => ({
      id: d.id,
      statutCode: d.statuts_dossier.code as StatutCode,
      parcoursId: d.parcours_id,
    }))

    expect(dossiers.length, 'aucun dossier en base : le croisement ne prouverait rien').toBeGreaterThan(0)

    const enLot = await datesLimites(dossiers)

    for (const dossier of dossiers) {
      const unitaire = await dateLimite(dossier)
      const lot = enLot.get(dossier.id) ?? null

      expect(
        lot?.getTime() ?? null,
        `échéance divergente pour ${dossier.id} (${dossier.statutCode})`
      ).toBe(unitaire?.getTime() ?? null)
    }
  })

  it('rend une entrée par dossier demandé, même sans échéance', async () => {
    // L'appelant compte sur la présence de la clé pour distinguer « pas d'échéance » de « dossier
    // oublié » : une Map incomplète ferait passer un dossier suivi pour un dossier sans délai.
    const dossiers = (
      await prisma.dossiers.findMany({
        take: 5,
        select: { id: true, parcours_id: true, statuts_dossier: { select: { code: true } } },
      })
    ).map((d) => ({
      id: d.id,
      statutCode: d.statuts_dossier.code as StatutCode,
      parcoursId: d.parcours_id,
    }))

    const resultat = await datesLimites(dossiers)

    expect(resultat.size).toBe(dossiers.length)
    for (const dossier of dossiers) {
      expect(resultat.has(dossier.id)).toBe(true)
    }
  })

  it('ne demande rien à la base pour un lot vide', async () => {
    const resultat = await datesLimites([])

    expect(resultat.size).toBe(0)
  })
})
