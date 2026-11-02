import { beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  role: vi.fn(), roles: vi.fn(), associations: vi.fn(), comptes: vi.fn(),
  upsert: vi.fn(), ajouter: vi.fn(), retirer: vi.fn(), transaction: vi.fn(), audit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: {
  roles: { findFirst: doubles.role, findMany: doubles.roles },
  model_has_roles: { findMany: doubles.associations },
  users: { count: doubles.comptes },
  notifications: { findMany: async () => [] },
  audit_logs: { findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
  $transaction: doubles.transaction,
} }))
vi.mock('../../audit/journal', () => ({ journaliser: doubles.audit, MODELES: {} }))

import { modifierPermissionsRole } from '../habilitations'

beforeEach(() => {
  vi.resetAllMocks()
  doubles.role.mockResolvedValue({ id: 10n, role_has_permissions: [
    { permissions: { name: 'actions.view', id: 20n } },
  ] })
  doubles.roles.mockResolvedValue([{ name: 'administrateur', actif: true,
    role_has_permissions: [{ permissions: { name: 'roles.manage' } }],
  }])
  doubles.associations.mockResolvedValue([{ model_id: 1n }])
  doubles.comptes.mockResolvedValue(1)
  doubles.upsert.mockResolvedValue({ id: 30n })
  doubles.transaction.mockImplementation(async (operation) => operation({
    permissions: { upsert: doubles.upsert },
    role_has_permissions: { createMany: doubles.ajouter, deleteMany: doubles.retirer },
  }))
})

describe('Enregistrement effectif des permissions', () => {
  it('crée un droit actif manquant en base et l’attribue au rôle', async () => {
    await modifierPermissionsRole({ id: 1n }, 'traitant', ['actions.view', 'plan_actions.view'])
    expect(doubles.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'plan_actions.view' } }))
    expect(doubles.ajouter).toHaveBeenCalledWith({ data: [{ role_id: 10n, permission_id: 30n }], skipDuplicates: true })
    expect(doubles.audit).toHaveBeenCalledOnce()
  })

  it('remonte un échec de création sans supprimer les anciens droits ni journaliser un succès', async () => {
    doubles.upsert.mockRejectedValue(new Error('Écriture refusée'))
    await expect(modifierPermissionsRole({ id: 1n }, 'traitant', ['plan_actions.view'])).rejects.toThrow('Écriture refusée')
    expect(doubles.retirer).not.toHaveBeenCalled()
    expect(doubles.audit).not.toHaveBeenCalled()
  })

  it('ne provisionne jamais un droit inconnu ou retiré', async () => {
    for (const permission of ['dossiers.assign', 'permission.inventee']) {
      await expect(modifierPermissionsRole({ id: 1n }, 'traitant', [permission])).rejects.toThrow('Permission inconnue')
    }
    expect(doubles.transaction).not.toHaveBeenCalled()
  })
})
