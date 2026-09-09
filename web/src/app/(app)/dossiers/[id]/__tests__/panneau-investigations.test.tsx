// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { InvestigationVue } from '../panneau-investigations'

/**
 * Ce que voit quelqu'un qui NE PEUT PAS agir sur une fiche d'investigation.
 *
 * Le retour reçu était « je ne vois pas de bouton de validation ». Le bouton existe et
 * s'affiche — pour qui a le droit et n'est pas l'enquêteur. Mais dans tous les autres cas
 * l'écran ne montrait rien du tout, et un vide se lit comme une fonction manquante.
 *
 * Ces cas fixent ce que l'écran doit dire à chacun. Ils passent par le vrai composant, avec les
 * booléens tels que le serveur les calcule : c'est la combinaison bouton/message qui compte, pas
 * le message seul.
 */
vi.mock('../investigations-actions', () => ({
  actionMettreAJourInvestigation: async () => ({}),
  actionOuvrirInvestigation: async () => ({}),
  actionSoumettreInvestigation: async () => ({}),
  actionValiderInvestigation: async () => ({}),
}))

const { PanneauInvestigations } = await import('../panneau-investigations')

const FICHE: InvestigationVue = {
  id: 'inv-1',
  dateOuverture: '2026-09-09T00:00:00.000Z',
  statut: 'en_attente_validation',
  faitsConstates: 'Des faits.',
  personnesRencontrees: null,
  causeImmediate: null,
  causesRacines: null,
  recommandations: 'Une recommandation.',
  enqueteur: 'Junior Koffi',
  validateur: null,
  valideLe: null,
  peutModifier: false,
  peutValider: false,
  estLEnqueteur: false,
}

const VALIDATEURS = ['Secrétaire CSST / Comité SST', 'Service MGP / DADD']

function afficher(fiche: Partial<InvestigationVue>, validateurs = VALIDATEURS) {
  render(
    <PanneauInvestigations
      dossierId="d-1"
      investigations={[{ ...FICHE, ...fiche }]}
      peutOuvrir={false}
      dossierEnInvestigation={false}
      validateurs={validateurs}
    />
  )
}

afterEach(cleanup)

describe('Quand on peut valider', () => {
  it('montre le bouton et n’explique rien', () => {
    afficher({ peutValider: true })

    expect(screen.getByRole('button', { name: 'Valider' })).toBeDefined()
    expect(screen.queryByText(/En attente de validation par/)).toBeNull()
  })
})

describe('Quand on ne peut pas valider', () => {
  it('dit à l’enquêteur que la fiche revient à quelqu’un d’autre, et à qui', () => {
    // C'est le cas exact du retour reçu : l'enquêteur porte le droit de valider, mais jamais
    // pour sa propre fiche. Sans message, l'absence de bouton passe pour une anomalie.
    afficher({ estLEnqueteur: true })

    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()
    expect(screen.getByText(/Vous avez mené cette investigation/)).toBeDefined()
    expect(screen.getByText(/Service MGP \/ DADD/)).toBeDefined()
  })

  it('nomme les rôles habilités à un lecteur qui n’en fait pas partie', () => {
    afficher({})

    expect(screen.getByText(/En attente de validation par/)).toBeDefined()
    expect(screen.getByText(/Secrétaire CSST/)).toBeDefined()
  })

  it('reste compréhensible quand aucun rôle habilité n’est configuré', () => {
    // Une liste vide ne doit pas produire « validation par :  » suivi de rien.
    afficher({}, [])

    expect(screen.getByText('En attente de validation.')).toBeDefined()
  })
})

describe('Quand la fiche n’est pas encore soumise', () => {
  it('n’explique rien à l’enquêteur, qui a le bouton pour agir', () => {
    afficher({ statut: 'en_cours', peutModifier: true, estLEnqueteur: true })

    expect(screen.getByRole('button', { name: 'Soumettre pour validation' })).toBeDefined()
    expect(screen.queryByText(/doit d’abord soumettre/)).toBeNull()
  })

  it('dit aux autres que la fiche attend son enquêteur', () => {
    afficher({ statut: 'en_cours', peutModifier: false })

    expect(screen.getByText(/L’enquêteur doit d’abord soumettre/)).toBeDefined()
  })
})

describe('Quand la fiche est validée', () => {
  it('n’ajoute aucune attente', () => {
    afficher({ statut: 'validee', validateur: 'Gestionnaire MGP/DADD', valideLe: '2026-09-09' })

    expect(screen.queryByText(/En attente/)).toBeNull()
    expect(screen.getByText(/Validée par Gestionnaire MGP\/DADD/)).toBeDefined()
  })
})
