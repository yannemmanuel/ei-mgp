import { describe, expect, it } from 'vitest'
import { formaterDateMetier } from '../date-metier'

describe('Formatage stable des dates du frontend', () => {
  it('utilise toujours le fuseau d’Abidjan pour éviter une hydratation différente', () => {
    expect(
      formaterDateMetier('2026-10-08T23:30:00Z', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    ).toBe('08/10/2026 23:30')
  })

  it('ne bascule pas au lendemain selon le fuseau de la machine', () => {
    expect(formaterDateMetier('2026-10-08T23:30:00Z', { dateStyle: 'long' })).toContain(
      '8 octobre 2026'
    )
  })
})
