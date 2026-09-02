import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise } from '../utilisateur'

/**
 * Vérifie le chargement des autorisations depuis la base réelle, de bout en bout : c'est la
 * fonction dont dépendent toutes les vérifications de droit à l'exécution.
 */
afterAll(async () => {
  await prisma.$disconnect()
})

describe('chargerUtilisateurAutorise', () => {
  it("résout les rôles et permissions d'un compte réel", async () => {
    const admin = await prisma.users.findFirstOrThrow({
      where: { email: 'admin@example.test' },
      select: { id: true },
    })

    const u = await chargerUtilisateurAutorise(admin.id)

    expect(u).not.toBeNull()
    expect(u!.roles).toContain('administrateur_digital')
    expect(u!.permissions.size).toBeGreaterThan(0)
    expect(u!.permissions.has('users.manage')).toBe(true)
  })

  it('retourne null pour un identifiant inexistant', async () => {
    expect(await chargerUtilisateurAutorise(999_999n)).toBeNull()
  })
})
