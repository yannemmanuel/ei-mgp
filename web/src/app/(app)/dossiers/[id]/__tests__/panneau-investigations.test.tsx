// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { InvestigationVue } from '../panneau-investigations'

/**
 * Ce que montre la section « Investigations » d'un dossier.
 *
 * ⚠️ CE FICHIER TESTAIT LA VALIDATION HIÉRARCHIQUE, supprimée le 2026-09-18 : une investigation
 * n'est soumise à aucune validation. Les cas d'alors (« qui peut valider », « à qui la fiche
 * revient ») portaient sur des gestes qui n'existent plus.
 *
 * Ce qui les remplace tient en deux choses : la fiche reste modifiable par qui en a le droit, et
 * plus AUCUN vocabulaire de validation ne doit reparaître à l'écran. Le second cas est celui qui
 * mord : c'est lui qui échouera si un bouton ou un message revient par un écran oublié.
 */
vi.mock('../investigations-actions', () => ({
  actionMettreAJourInvestigation: async () => ({}),
  actionOuvrirInvestigation: async () => ({}),
}))

const { PanneauInvestigations } = await import('../panneau-investigations')

const FICHE: InvestigationVue = {
  id: 'inv-1',
  dateOuverture: '2026-09-09T00:00:00.000Z',
  faitsConstates: 'Des faits.',
  personnesRencontrees: null,
  causeImmediate: null,
  causesRacines: null,
  recommandations: 'Une recommandation.',
  enqueteur: 'Junior Koffi',
  peutModifier: false,
}

function afficher(fiche: Partial<InvestigationVue> = {}) {
  render(
    <PanneauInvestigations
      dossierId="d-1"
      investigations={[{ ...FICHE, ...fiche }]}
      peutOuvrir={false}
      dossierEnInvestigation={false}
    />
  )
}

afterEach(cleanup)

describe('Contenu de la fiche', () => {
  it('montre l’enquêteur, les faits et les recommandations', () => {
    afficher()

    expect(screen.getByText(/Junior Koffi/)).toBeDefined()
    expect(screen.getByText('Des faits.')).toBeDefined()
    expect(screen.getByText('Une recommandation.')).toBeDefined()
  })
})

describe('Modification', () => {
  it('offre « Modifier » à qui en a le droit', () => {
    // Plus aucune condition de statut : une fiche n'est jamais figée, puisque plus aucune étape
    // ne la fige.
    afficher({ peutModifier: true })

    expect(screen.getByRole('button', { name: 'Modifier' })).toBeDefined()
  })

  it('ne l’offre pas aux autres', () => {
    afficher({ peutModifier: false })

    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })
})

describe('⚠️ Plus aucune trace de validation à l’écran', () => {
  it('n’affiche ni bouton, ni statut, ni message d’attente', () => {
    /*
      ⚠️ Ce cas est le garde-fou de la suppression. Il est vérifié sur les DEUX états de droits :
      un bouton réservé à qui peut modifier échapperait sinon au rendu par défaut.
    */
    for (const peutModifier of [true, false]) {
      cleanup()
      afficher({ peutModifier })

      for (const libelle of ['Valider', 'Soumettre pour validation']) {
        expect(
          screen.queryByRole('button', { name: libelle }),
          `le bouton « ${libelle} » est revenu`
        ).toBeNull()
      }

      for (const texte of [
        /En attente de validation/,
        /Validée par/,
        /doit d’abord soumettre/,
        /Vous avez mené cette investigation/,
      ]) {
        expect(screen.queryByText(texte), `« ${texte.source} » est revenu à l’écran`).toBeNull()
      }
    }
  })
})
