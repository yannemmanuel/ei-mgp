// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../actions', () => ({
  actionChangerStatut: async () => ({}),
  actionQualifierFamilleRisque: async () => ({}),
  actionQualifierGravite: async () => ({}),
  actionCloturer: async () => ({}),
  actionBasculerContentieux: async () => ({}),
  actionRejeter: async () => ({}),
  actionReouvrir: async () => ({}),
}))

const { PanneauActions } = await import('../panneau-actions')

function afficher(familleRisqueActuelle: string) {
  render(
    <PanneauActions
      dossierId="dossier-ei-1"
      statutCode="recu"
      affectations={[]}
      parRattachement
      transitions={[]}
      acteursDeLEtape={[]}
      gravitesAQualifier={[]}
      famillesRisque={[{ valeur: '1', libelle: 'Risque opérationnel' }]}
      familleRisqueActuelle={familleRisqueActuelle}
      droits={{
        changerStatut: true,
        cloturer: false,
        reouvrir: false,
        gererContentieux: false,
      }}
      contentieux={false}
    />
  )
}

afterEach(cleanup)

describe('Qualification de la famille de risque', () => {
  it('propose la qualification tant que la famille est absente', () => {
    afficher('')

    expect(screen.getByRole('combobox', { name: 'Famille de risque' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Enregistrer la famille' })).toBeDefined()
  })

  it('fait disparaître la carte dès qu’une famille est enregistrée', () => {
    afficher('1')

    expect(screen.queryByRole('combobox', { name: 'Famille de risque' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer la famille' })).toBeNull()
  })
})
