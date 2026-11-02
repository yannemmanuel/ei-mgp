import { describe, expect, it } from 'vitest'
import { aPermission, aUnePermissionParmi } from '../utilisateur'
import { PERMISSIONS_ACTIVES, PERMISSIONS_RETIREES, type Permission } from '../permissions'

describe('Catalogue opérationnel des habilitations', () => {
  it.each(PERMISSIONS_RETIREES)('retire %s même encore attribuée en base', (permission) => {
    const compte = { permissions: new Set<Permission>([permission]) }
    expect(aPermission(compte, permission)).toBe(false)
    expect(aUnePermissionParmi(compte, [permission])).toBe(false)
    expect(PERMISSIONS_ACTIVES).not.toContain(permission)
  })

  it('sépare la consultation du PA des actions correctives', () => {
    const compte = { permissions: new Set<Permission>(['plan_actions.view']) }
    expect(aPermission(compte, 'plan_actions.view')).toBe(true)
    expect(aPermission(compte, 'actions.view')).toBe(false)
    expect(PERMISSIONS_ACTIVES).toContain('plan_actions.view')
  })
})
