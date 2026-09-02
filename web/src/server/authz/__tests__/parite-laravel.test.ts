import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PERMISSIONS } from '../permissions'
import { ROLES, ROLE_NAMES } from '../roles'

/**
 * Test de PARITÉ : compare le portage TypeScript au contenu réel de la base Laravel.
 *
 * C'est le garde-fou central de la migration. Les tests de policy ci-à-côté vérifient que la
 * LOGIQUE est correcte ; celui-ci vérifie que les DONNÉES sur lesquelles elle s'appuie (les 34
 * permissions, les 15 rôles et leurs 84 associations) n'ont pas divergé du seeder Laravel.
 *
 * Lecture seule — aucune écriture n'est effectuée.
 */
const GUARD = 'web'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Parité avec la base Laravel', () => {
  it('déclare exactement les mêmes permissions que la table `permissions`', async () => {
    const enBase = await prisma.permissions.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    expect([...PERMISSIONS].sort()).toEqual(enBase.map((p) => p.name).sort())
  })

  it('déclare exactement les mêmes rôles que la table `roles`', async () => {
    const enBase = await prisma.roles.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    expect([...ROLE_NAMES].sort()).toEqual(enBase.map((r) => r.name).sort())
  })

  it('attribue à chaque rôle exactement les mêmes permissions qu\'en base', async () => {
    const enBase = await prisma.roles.findMany({
      where: { guard_name: GUARD },
      select: {
        name: true,
        role_has_permissions: { select: { permissions: { select: { name: true, guard_name: true } } } },
      },
    })

    for (const role of enBase) {
      const attendu = [...(ROLES[role.name as keyof typeof ROLES] ?? [])].sort()
      const reel = role.role_has_permissions
        .filter((rhp) => rhp.permissions.guard_name === GUARD)
        .map((rhp) => rhp.permissions.name)
        .sort()

      expect(reel, `permissions du rôle « ${role.name} »`).toEqual(attendu)
    }
  })

  it('retrouve le même nombre total d\'associations rôle × permission', async () => {
    const total = await prisma.role_has_permissions.count()
    const attendu = Object.values(ROLES).reduce((n, perms) => n + perms.length, 0)

    expect(total).toBe(attendu)
  })
})
