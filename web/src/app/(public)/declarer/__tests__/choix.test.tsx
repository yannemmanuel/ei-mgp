// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChoixParcours } from '../choix'

/**
 * Libellés des profils, et routage inchangé.
 *
 * Les trois profils ne sont pas dans le HTML servi : ils n'apparaissent qu'après avoir indiqué
 * qu'on dépose une plainte. Un contrôle qui se contenterait de lire la page initiale les
 * déclarerait absents — ce qu'il a d'abord fait. Il faut cliquer.
 *
 * ⚠️ Le retour métier du 11/09 ne change QUE les libellés. Les destinations, elles, ne bougent
 * pas : renommer un profil ne doit pas rediriger le déclarant vers un autre formulaire, et c'est
 * le genre d'erreur qu'un simple renommage rend facile.
 */
afterEach(cleanup)

async function allerAuChoixDeProfil() {
  const utilisateur = userEvent.setup()
  render(<ChoixParcours />)

  await utilisateur.click(screen.getByRole('button', { name: /plainte|grief/i }))
  return utilisateur
}

describe('Choix du profil', () => {
  it('porte les trois libellés demandés', async () => {
    await allerAuChoixDeProfil()

    expect(screen.getByText('Employé SODECI')).toBeDefined()
    expect(screen.getByText('Sous-Traitant SODECI')).toBeDefined()
    expect(screen.getByText('Riverain ou membre de la communauté')).toBeDefined()
  })

  it('mène chaque profil vers le formulaire qui lui correspond', async () => {
    await allerAuChoixDeProfil()

    const destination = (libelle: string) =>
      screen.getByText(libelle).closest('a')?.getAttribute('href') ??
      screen.getByText(libelle).closest('button')?.getAttribute('data-parcours')

    expect(destination('Employé SODECI')).toContain('grief_employe')
    expect(destination('Sous-Traitant SODECI')).toContain('grief_sous_traitant')
    expect(destination('Riverain ou membre de la communauté')).toContain('grief_communaute')
  })
})
