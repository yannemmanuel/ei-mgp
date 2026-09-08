import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PERMISSIONS, ROLES, ROLE_NAMES } from '@/server/authz'
import { chargerHabilitations } from '../habilitations'

/**
 * Matrice des habilitations.
 *
 * Son intérêt n'est pas d'afficher une table : c'est de rendre visible un écart entre ce qui a
 * été décidé (le code) et ce qui s'applique (la base). Une dérive silencieuse signifie que
 * quelqu'un dispose d'un droit qui ne lui a pas été accordé, ou se voit refuser un accès prévu.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`
const associationsRetirees: { role_id: bigint; permission_id: bigint }[] = []

afterEach(async () => {
  // Rétablit toute association retirée par un test : cette table est une donnée réelle.
  for (const a of associationsRetirees) {
    await prisma.role_has_permissions.create({ data: a })
  }
  associationsRetirees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Lecture de la matrice', () => {
  it('expose tous les rôles et toutes les permissions', async () => {
    const { lignes, permissions } = await chargerHabilitations()

    expect(lignes.map((l) => l.role).sort()).toEqual([...ROLE_NAMES].sort())
    expect(permissions).toEqual(PERMISSIONS)
  })

  it('restitue les permissions décidées pour chaque rôle', async () => {
    const { lignes } = await chargerHabilitations()

    for (const ligne of lignes) {
      expect(ligne.permissions, `rôle ${ligne.role}`).toEqual(ROLES[ligne.role])
    }
  })

  it('compte les comptes ACTIFS porteurs de chaque rôle', async () => {
    const { lignes } = await chargerHabilitations()

    const attendu = await prisma.model_has_roles.count({
      where: { model_type: MODEL_TYPE_USER },
    })
    const total = lignes.reduce((somme, l) => somme + l.comptes, 0)

    // Tous les comptes de la base de développement sont actifs : le total doit coïncider.
    expect(total).toBe(attendu)
  })
})

describe('Détection d’écart', () => {
  it('ne signale aucun écart quand la base est conforme', async () => {
    const { ecarts } = await chargerHabilitations()

    expect(ecarts).toEqual([])
  })

  it('signale une permission retirée de la base', async () => {
    const role = await prisma.roles.findFirstOrThrow({
      where: { name: 'service_mgp' },
      select: { id: true },
    })
    const permission = await prisma.permissions.findFirstOrThrow({
      where: { name: 'reporting.export.nominatif' },
      select: { id: true },
    })

    await prisma.role_has_permissions.delete({
      where: { permission_id_role_id: { permission_id: permission.id, role_id: role.id } },
    })
    associationsRetirees.push({ role_id: role.id, permission_id: permission.id })

    const { ecarts } = await chargerHabilitations()
    const ecart = ecarts.find((e) => e.role === 'service_mgp')

    // Le sens compte : une permission absente de la base PRIVE d'un accès décidé. C'est
    // exactement la dérive qu'un test avait déjà trouvée, et qu'aucun écran ne montrait.
    expect(ecart?.manquantes).toContain('reporting.export.nominatif')
    expect(ecart?.enTrop).toEqual([])
  })
})
