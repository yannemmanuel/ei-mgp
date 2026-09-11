// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EtatCompte } from '../actions'

/**
 * Le panneau des comptes, exercé dans un vrai DOM.
 *
 * Motif : Base UI signalait « a component is changing the default value state of an uncontrolled
 * FieldControl after being initialized ». Un avertissement de console, mais qui décrit un
 * formulaire dont les champs cessent de suivre ce qu'ils sont censés éditer — ce qui se vérifie
 * par ce qui est ENVOYÉ, pas par ce qui est écrit dans la console.
 *
 * Seuls sont remplacés les modules qui franchissent une frontière : les Server Actions et le
 * routeur. Rien de la logique du panneau ne l'est.
 */
const soumissions: FormData[] = []

vi.mock('../actions', () => ({
  actionEnregistrerCompte: async (_etat: EtatCompte, donnees: FormData): Promise<EtatCompte> => {
    soumissions.push(donnees)
    return {}
  },
  actionRegenererMotDePasse: async (): Promise<EtatCompte> => ({}),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const { PanneauComptes } = await import('../panneau')

const compte = (id: string, name: string, email: string) => ({
  id,
  name,
  email,
  matricule: '',
  poste: '',
  actif: true,
  directionId: '',
  siteId: '',
  responsableId: '',
  roles: [],
  site: null,
  direction: null,
  siteManquant: false,
  rattachementIncoherent: false,
  parcoursAttribues: [],
  parcours: [],
  tousLesParcours: false,
  parcoursPossibles: [],
})

const ALICE = compte('01', 'Alice Kouamé', 'alice@example.ci')
const BAKARY = compte('02', 'Bakary Traoré', 'bakary@example.ci')

function afficher() {
  soumissions.length = 0

  render(
    <PanneauComptes
      comptes={[ALICE, BAKARY]}
      roles={[{ nom: 'agent', libelle: 'Agent', actif: true, parcours: ['grief_employe'] }]}
      parcours={[{ code: 'grief_employe', libelle: 'Grief / plainte (Employé)' }]}
      directions={[{ id: '1', libelle: 'Direction Exploitation' }]}
      sites={[{ id: '1', libelle: 'San Pédro' }]}
      recherche=""
    />
  )

  return userEvent.setup()
}

afterEach(cleanup)

const modifier = (indice: number) => screen.getAllByRole('button', { name: 'Modifier' })[indice]
const champNom = () => screen.getByLabelText(/^Nom/i) as HTMLInputElement
const champEmail = () => screen.getByLabelText(/Adresse e-mail/i) as HTMLInputElement

describe('Passer d’un compte à l’autre sans refermer le formulaire', () => {
  it('affiche le compte réellement sélectionné', async () => {
    const utilisateur = afficher()

    await utilisateur.click(modifier(0))
    await waitFor(() => expect(champNom().value).toBe('Alice Kouamé'))

    // Rien n'empêche de cliquer « Modifier » sur une autre ligne : le formulaire reste ouvert.
    await utilisateur.click(modifier(1))

    await waitFor(() => expect(champNom().value, 'le formulaire montre un autre compte').toBe('Bakary Traoré'))
    expect(champEmail().value).toBe('bakary@example.ci')
  })

  it('n’écrit JAMAIS les valeurs d’un compte sur l’identifiant d’un autre', async () => {
    // Le vrai risque derrière l'avertissement. L'identifiant est un champ caché contrôlé : il
    // suit la sélection. Les champs visibles, eux, sont initialisés au montage. S'ils ne se
    // réinitialisent pas, on enregistre le nom et l'adresse d'Alice SUR le compte de Bakary.
    const utilisateur = afficher()

    await utilisateur.click(modifier(0))
    await waitFor(() => expect(champNom().value).toBe('Alice Kouamé'))

    await utilisateur.click(modifier(1))
    await utilisateur.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(soumissions).toHaveLength(1))

    const envoi = soumissions[0]
    expect(envoi.get('id')).toBe(BAKARY.id)
    expect(envoi.get('name'), 'le nom d’Alice a été enregistré sur le compte de Bakary').toBe(
      BAKARY.name
    )
    expect(envoi.get('email')).toBe(BAKARY.email)
  })
})

describe('Confier un type de déclaration', () => {
  it('ne propose rien tant qu’aucun rôle n’est coché', async () => {
    // Le parcours se confie DANS le champ de ce que le rôle permet. Sans rôle, il n'y a rien à
    // confier, et proposer des cases inertes ferait croire à une habilitation.
    const utilisateur = afficher()

    await utilisateur.click(modifier(0))

    await waitFor(() => expect(screen.queryByText(/Cochez d’abord un rôle/i)).not.toBeNull())
    expect(
      screen.queryByLabelText(/Grief \/ plainte \(Employé\)/i),
      'une case de parcours est proposée sans aucun rôle'
    ).toBeNull()
  })

  it('fait apparaître les parcours du rôle dès qu’on le coche', async () => {
    /*
      Le geste que l'écran doit rendre possible en une seule passe : cocher le rôle, puis
      confier le parcours. Si la liste n'apparaissait qu'après enregistrement, il faudrait
      enregistrer deux fois — et un administrateur qui ne le sait pas repartirait en croyant la
      personne habilitée.
    */
    const utilisateur = afficher()

    await utilisateur.click(modifier(0))
    await utilisateur.click(screen.getByLabelText(/Agent/i))

    const parcours = await screen.findByLabelText(/Grief \/ plainte \(Employé\)/i)
    await utilisateur.click(parcours)
    await utilisateur.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(soumissions).toHaveLength(1))

    expect(
      soumissions[0].getAll('parcours'),
      'le parcours coché n’a pas été envoyé au serveur'
    ).toEqual(['grief_employe'])
  })

  it('n’envoie aucun parcours quand aucune case n’est cochée', async () => {
    // La contrepartie, et le cas qui coupe l'accès : décocher doit vouloir dire « plus rien »,
    // pas « laisser en l'état ». Le service remplace la liste complète, il faut donc que le
    // formulaire envoie bien une liste vide.
    const utilisateur = afficher()

    await utilisateur.click(modifier(0))
    await utilisateur.click(screen.getByLabelText(/Agent/i))
    await screen.findByLabelText(/Grief \/ plainte \(Employé\)/i)
    await utilisateur.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(soumissions).toHaveLength(1))

    expect(soumissions[0].getAll('parcours')).toEqual([])
  })
})
