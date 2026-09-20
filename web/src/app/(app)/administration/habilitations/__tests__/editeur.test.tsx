// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EtatHabilitation } from '../actions'

/** Les types proposés à la coche : deux suffisent à exercer l'écran. */
const PARCOURS_TEST = [
  { code: 'ei_employe', libelle: 'Événement Indésirable (Employé)' },
  { code: 'grief_employe', libelle: 'Grief / plainte (Employé)' },
]


/**
 * L'éditeur des rôles, exercé dans un vrai DOM.
 *
 * Motif : Base UI signalait « a component is changing the default value state of an uncontrolled
 * FieldControl after being initialized ». Ici l'identité du rôle n'est jamais confondue — la fiche
 * est indexée par `role.role`. Ce qui change, ce sont les DONNÉES du même rôle : l'enregistrement
 * appelle `revalidatePath()`, et la page revient avec ce que le serveur a retenu, espaces élagués.
 *
 * L'invariant vérifié ici est donc : le formulaire montre ce qui est ENREGISTRÉ, pas ce qui a été
 * tapé. Il se teste en rejouant le rendu avec des données rafraîchies, comme le ferait la
 * revalidation.
 */
const inerte = async (): Promise<EtatHabilitation> => ({})

vi.mock('../actions', () => ({
  actionChangerActivationRole: inerte,
  actionCreerRole: inerte,
  actionModifierHabilitations: inerte,
  actionModifierIdentiteRole: inerte,
  actionModifierParcoursRole: inerte,
  actionSupprimerRole: inerte,
}))

const { EditeurHabilitations } = await import('../editeur')

const DOMAINES = [
  {
    cle: 'dossiers',
    titre: 'Dossiers',
    description: 'Consultation et traitement.',
    permissions: [
      {
        nom: 'dossiers.view',
        libelle: 'Consulter',
        explication: 'Voir les dossiers de son parcours.',
        sensibilite: 'ordinaire' as const,
      },
    ],
  },
]

const role = (libelle: string, description: string | null, permissions: string[] = []) => ({
  role: 'agent',
  libelle,
  description,
  actif: true,
  permissions,
  comptes: 0,
  retirees: [],
  ajoutees: [],
  livre: false,
  rattachements: 0,
  parcours: [],
  tousLesParcours: false,
})

afterEach(cleanup)

const champNom = () => screen.getByLabelText(/Nom affiché/i) as HTMLInputElement
const champDescription = () => screen.getByLabelText(/Description/i) as HTMLInputElement

describe('Le formulaire d’identité montre ce qui est enregistré', () => {
  /**
   * Choisit le rôle dans la liste de GAUCHE, puis ouvre son onglet « Nom ».
   *
   * L'écran était fait de fiches dépliantes ouvertes par un bouton « Modifier » ; il est
   * désormais en maître-détail. Le geste change, l'invariant vérifié ci-dessous non.
   */
  async function ouvrirOngletNom(utilisateur: ReturnType<typeof userEvent.setup>) {
    await utilisateur.click(screen.getByRole('button', { name: /Agent/ }))
    await utilisateur.click(screen.getByRole('tab', { name: 'Nom' }))
  }

  it('reprend le libellé tel que le serveur l’a retenu', async () => {
    const utilisateur = userEvent.setup()
    const { rerender } = render(
      <EditeurHabilitations roles={[role('Agent', 'Traite les dossiers.')]} domaines={DOMAINES} parcoursDisponibles={PARCOURS_TEST} />
    )

    await ouvrirOngletNom(utilisateur)
    expect(champNom().value).toBe('Agent')

    // Ce que fait `revalidatePath()` après un enregistrement : la page revient avec les valeurs
    // stockées. Le serveur élague — « Agent terrain   » a été rangé sans ses espaces.
    rerender(
      <EditeurHabilitations
        roles={[role('Agent terrain', 'Traite les dossiers.')]}
        domaines={DOMAINES}
      parcoursDisponibles={PARCOURS_TEST} />
    )

    await waitFor(() =>
      expect(champNom().value, 'le champ affiche autre chose que ce qui est enregistré').toBe(
        'Agent terrain'
      )
    )
  })

  it('reflète une description ramenée à vide par le serveur', async () => {
    // Le cas qui trompe le plus : une description de trois espaces est stockée `null`. Sans
    // remontage, l'administrateur croit qu'une description existe.
    const utilisateur = userEvent.setup()
    const { rerender } = render(
      <EditeurHabilitations roles={[role('Agent', 'Ancienne description.')]} domaines={DOMAINES} parcoursDisponibles={PARCOURS_TEST} />
    )

    await ouvrirOngletNom(utilisateur)
    expect(champDescription().value).toBe('Ancienne description.')

    rerender(<EditeurHabilitations roles={[role('Agent', null)]} domaines={DOMAINES} parcoursDisponibles={PARCOURS_TEST} />)

    await waitFor(() => expect(champDescription().value).toBe(''))
  })

  it('ne se remonte PAS quand rien d’enregistré n’a changé', async () => {
    // La contrepartie. Un enregistrement voisin — les droits, l'activation — provoque lui aussi
    // une revalidation. Si le formulaire se remontait à chaque rendu, une saisie en cours
    // disparaîtrait sans un mot.
    const utilisateur = userEvent.setup()
    const { rerender } = render(
      <EditeurHabilitations roles={[role('Agent', 'Traite les dossiers.')]} domaines={DOMAINES} parcoursDisponibles={PARCOURS_TEST} />
    )

    await ouvrirOngletNom(utilisateur)
    await utilisateur.clear(champNom())
    await utilisateur.type(champNom(), 'Saisie en cours')

    // Mêmes valeurs enregistrées, objet neuf : exactement ce que produit une revalidation.
    rerender(
      <EditeurHabilitations
        roles={[role('Agent', 'Traite les dossiers.', ['dossiers.view'])]}
        domaines={DOMAINES}
      parcoursDisponibles={PARCOURS_TEST} />
    )

    expect(champNom().value, 'une saisie en cours a été effacée').toBe('Saisie en cours')
  })
})
