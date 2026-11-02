import { describe, expect, it } from 'vitest'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { perimetreDossiers } from '../liste'

describe('Révocation de la lecture des déclarations personnelles', () => {
  it('ne sélectionne aucun dossier lorsque toutes les permissions de lecture sont retirées', () => {
    const utilisateur = {
      ...utilisateurAvecRoles('employe_declarant'),
      permissions: new Set<never>(),
    }

    expect(perimetreDossiers(utilisateur)).toEqual({ id: { in: [] } })
  })
})
