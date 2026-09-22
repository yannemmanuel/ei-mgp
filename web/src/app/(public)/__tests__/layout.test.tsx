// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LayoutPublic from '../layout'

/**
 * La coquille publique ne doit jamais mener à une zone authentifiée.
 *
 * Elle sert des visiteurs ANONYMES par construction — déclarants, personnes qui suivent un
 * dossier. Le piège est `/` : ce n'est pas un accueil mais un aiguillage personnel qui renvoie à
 * `/login` faute de session. La marque y pointait, et cliquer dessus en cours de déclaration
 * expédiait le déclarant sur la connexion du personnel, saisie perdue.
 *
 * Le test porte donc sur la DESTINATION, pas sur l'apparence : c'est elle qui était fausse.
 */
afterEach(cleanup)

function afficher() {
  const Coquille = LayoutPublic as unknown as (p: {
    children: React.ReactNode
  }) => React.ReactElement

  render(<Coquille>{<p>Formulaire de déclaration</p>}</Coquille>)
}

/** Routes servies sans session. Tout le reste exige une authentification. */
const PUBLIQUES = ['/declarer', '/suivi', '/q']

describe('Coquille publique', () => {
  it('ne renvoie nulle part qui exige une session', () => {
    afficher()

    const destinations = screen
      .getAllByRole('link')
      .map((lien) => lien.getAttribute('href') ?? '')

    expect(destinations.length).toBeGreaterThan(0)

    for (const destination of destinations) {
      // `/` inclus, et nommément : c'est lui qui produisait le défaut.
      expect(
        PUBLIQUES.some((prefixe) => destination.startsWith(prefixe)),
        `« ${destination} » n’est pas une route publique`
      ).toBe(true)
    }
  })

  it('mène la marque au point d’entrée de la déclaration', () => {
    afficher()

    // EX-DEC-01/02 : `/declarer` est le point d'entrée unique. C'est l'accueil de qui est ici.
    expect(screen.getByRole('link', { name: /Digitalisation EI \/ MGP/i })).toHaveProperty(
      'pathname',
      '/declarer'
    )
  })
})
