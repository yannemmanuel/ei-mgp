import { describe, expect, it } from 'vitest'
import { STATUTS, transitionAutorisee, transitionsDepuis, type StatutCode } from '../statuts'

const ATTENDUES: Readonly<Record<StatutCode, readonly StatutCode[]>> = {
  recu: ['en_analyse'],
  en_analyse: ['en_investigation'],
  en_investigation: ['en_attente_information', 'action_corrective_en_cours'],
  en_attente_information: ['en_investigation'],
  action_corrective_en_cours: ['resolu'],
  resolu: [],
  cloture: [],
  reouvert: ['en_investigation', 'action_corrective_en_cours'],
  rejete: [],
}

describe('Arbre de décision exhaustif des statuts', () => {
  it.each(STATUTS)('expose exactement les sorties métier de « %s »', (depuis) => {
    expect([...transitionsDepuis(depuis)].sort()).toEqual([...ATTENDUES[depuis]].sort())
  })

  it.each(STATUTS.flatMap((depuis) => STATUTS.map((vers) => [depuis, vers] as const)))(
    '%s → %s respecte la matrice complète',
    (depuis, vers) => {
      expect(transitionAutorisee(depuis, vers)).toBe(ATTENDUES[depuis].includes(vers))
    }
  )

  it('ne propose aucune transition manuelle depuis les états à action dédiée ou terminaux', () => {
    for (const statut of ['resolu', 'cloture', 'rejete'] as const) {
      expect(transitionsDepuis(statut)).toEqual([])
    }
  })
})
