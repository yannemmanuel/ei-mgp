// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DomaineVue, RoleVue } from '../editeur'

/**
 * Regroupement de l'écran des habilitations, exercé dans un vrai DOM.
 *
 * L'écran déroulait trente-six droits et trois formulaires par rôle ouvert. Les replier tient de
 * la mise en page — sauf sur un point, qui n'en est pas un : ⚠️ les formulaires masqués doivent
 * rester MONTÉS. Un onglet qui démonte le formulaire des droits vide les cases cochées dès qu'on
 * va vérifier le nom du rôle, sans le dire et sans erreur. Le formulaire public de déclaration a
 * perdu des saisies exactement ainsi.
 *
 * Seul le module d'actions est remplacé : il franchit la frontière serveur. Rien de la logique
 * de l'éditeur ne l'est.
 */
vi.mock('../actions', () => ({
  actionChangerActivationRole: async () => ({}),
  actionCreerRole: async () => ({}),
  actionModifierHabilitations: async () => ({}),
  actionModifierIdentiteRole: async () => ({}),
  actionSupprimerRole: async () => ({}),
}))

const { EditeurHabilitations } = await import('../editeur')

const DOMAINES: DomaineVue[] = [
  {
    cle: 'dossiers',
    titre: 'Dossiers',
    description: 'Consulter et faire avancer les déclarations.',
    permissions: [
      {
        nom: 'dossiers.view',
        libelle: 'Voir les dossiers',
        explication: 'Ouvrir la liste et le détail.',
        sensibilite: 'ordinaire',
      },
      {
        nom: 'dossiers.close',
        libelle: 'Clôturer un dossier',
        explication: 'Fermer un dossier traité.',
        sensibilite: 'ordinaire',
      },
    ],
  },
  {
    cle: 'technique',
    titre: 'Administration technique',
    description: 'Comptes, rôles et supports.',
    permissions: [
      {
        nom: 'users.manage',
        libelle: 'Gérer les comptes',
        explication: 'Créer, activer, désactiver.',
        sensibilite: 'gouvernance',
      },
    ],
  },
]

const ROLE: RoleVue = {
  role: 'secretaire_csst',
  libelle: 'Secrétaire CSST',
  description: 'Reçoit les déclarations de son site.',
  actif: true,
  permissions: ['dossiers.view'],
  comptes: 2,
  retirees: [],
  ajoutees: [],
  livre: true,
  rattachements: 2,
  parcours: ['ei_employe'],
}

/** Rôle créé depuis l'interface : supprimable, et sans accès aux dossiers. */
const ROLE_CREE: RoleVue = {
  role: 'gestionnaire_des_supports',
  libelle: 'Gestionnaire des supports',
  description: null,
  actif: true,
  permissions: ['users.manage'],
  comptes: 0,
  retirees: [],
  ajoutees: [],
  livre: false,
  rattachements: 0,
  parcours: [],
}

function afficher(roles: RoleVue[] = [ROLE]) {
  render(<EditeurHabilitations roles={roles} domaines={DOMAINES} />)
  return userEvent.setup()
}

afterEach(cleanup)

describe('Ce que l’écran montre au repos', () => {
  it('n’affiche aucune case à cocher tant qu’aucun rôle n’est ouvert', () => {
    afficher()

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('Secrétaire CSST')).toBeDefined()
  })

  it('ouvre les droits d’abord, et un seul formulaire à la fois', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))

    // L'onglet des droits est celui qui est actif à l'ouverture.
    expect(screen.getByRole('tab', { name: /Droits/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Nom' }).getAttribute('aria-selected')).toBe('false')

    // Le champ « Nom affiché » existe, mais dans une section masquée.
    const nom = screen.getByLabelText('Nom affiché')
    expect(estVisible(nom)).toBe(false)
  })
})

describe('Navigation au clavier', () => {
  it('passe d’un onglet à l’autre aux flèches, comme le rôle « tablist » l’annonce', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))

    const droits = screen.getByRole('tab', { name: /Droits/ })
    droits.focus()

    await clavier.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Nom' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Nom' }))

    await clavier.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Désactiver' }).getAttribute('aria-selected')).toBe(
      'true'
    )
  })
})

describe('Trouver un droit précis', () => {
  it('montre tous les droits à l’ouverture, y compris ceux que le rôle n’a pas', async () => {
    /*
      Replier les domaines que le rôle ne touche pas cachait justement le droit qu'on venait
      accorder : on ouvre cet écran pour donner un droit que le rôle n'a PAS. Le retour reçu
      était qu'on s'y perdait.
    */
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))

    expect(screen.getByLabelText(/Voir les dossiers/)).toBeDefined()
    expect(screen.getByLabelText(/Gérer les comptes/), 'un droit non détenu reste caché').toBeDefined()
  })

  it('filtre les droits sur la recherche, tous domaines confondus', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'comptes')

    expect(screen.getByLabelText(/Gérer les comptes/)).toBeDefined()
    expect(screen.queryByLabelText(/Voir les dossiers/), 'droit hors recherche encore affiché').toBeNull()
  })

  it('cherche aussi dans l’explication, pas seulement dans le nom', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'Fermer un dossier')

    expect(screen.getByLabelText(/Clôturer un dossier/)).toBeDefined()
  })

  it('garde le compte du domaine ENTIER pendant une recherche', async () => {
    // « 2/9 » qui deviendrait « 1/1 » ferait croire à des droits perdus.
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))

    const avant = screen.getByRole('button', { name: /Dossiers/ }).textContent
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'clôturer')

    expect(screen.getByRole('button', { name: /Dossiers/ }).textContent).toBe(avant)
  })

  it('le dit quand rien ne correspond', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'marmotte')

    expect(screen.getByText(/Aucun droit ne correspond/)).toBeDefined()
  })
})

describe('Ce qu’un onglet ne doit pas faire disparaître', () => {
  it('conserve les cases cochées quand on passe à l’onglet du nom et qu’on revient', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))

    // On coche un droit que le rôle n'avait pas.
    const clore = screen.getByLabelText(/Clôturer un dossier/) as HTMLInputElement
    await clavier.click(clore)
    expect(clore.checked).toBe(true)

    // Aller-retour par l'onglet du nom : le formulaire des droits est masqué, pas démonté.
    await clavier.click(screen.getByRole('tab', { name: 'Nom' }))
    await clavier.click(screen.getByRole('tab', { name: /Droits/ }))

    expect(
      (screen.getByLabelText(/Clôturer un dossier/) as HTMLInputElement).checked,
      'la case cochée a été perdue au passage par un autre onglet'
    ).toBe(true)
  })

  it('soumet bien le droit ajouté, et pas seulement à l’écran', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.click(screen.getByLabelText(/Clôturer un dossier/))
    await clavier.click(screen.getByRole('tab', { name: 'Nom' }))

    // Les champs réellement envoyés sont les champs cachés du formulaire des droits : ce sont eux
    // que le serveur lira, pas l'état des cases.
    const envoyes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="permissions"]')
    ).map((champ) => champ.value)

    expect(envoyes.sort()).toEqual(['dossiers.close', 'dossiers.view'])
  })
})

describe('Créer et supprimer un rôle', () => {
  it('prévient, avant la création, qu’un rôle créé ici n’ouvre aucun dossier', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Nouveau rôle' }))

    expect(screen.getByLabelText('Nom affiché')).toBeDefined()
    expect(screen.getByText(/aucun dossier/)).toBeDefined()
  })

  it('ne propose pas la suppression d’un rôle livré', async () => {
    // Le code s'y réfère par son nom : la désactivation est la seule opération de retrait.
    const clavier = afficher([ROLE])

    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.click(screen.getByRole('tab', { name: 'Désactiver' }))

    expect(screen.getByRole('button', { name: 'Désactiver…' })).toBeDefined()
    expect(screen.queryByText('Supprimer ce rôle')).toBeNull()
  })

  it('propose la suppression d’un rôle créé ici', async () => {
    const clavier = afficher([ROLE_CREE])

    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.click(screen.getByRole('tab', { name: 'Désactiver' }))

    expect(screen.getByText('Supprimer ce rôle')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Supprimer…' })).toBeDefined()
  })

  it('retire le bouton de suppression tant que des comptes portent le rôle', async () => {
    // Supprimer un rôle rattaché retirerait un accès sans le dire : l'écran indique quoi faire
    // d'abord, plutôt que d'offrir un bouton que le serveur refusera.
    const rattache = { ...ROLE_CREE, rattachements: 3 }
    const clavier = afficher([rattache])

    await clavier.click(screen.getByRole('button', { name: 'Modifier' }))
    await clavier.click(screen.getByRole('tab', { name: 'Désactiver' }))

    expect(screen.getByText('Supprimer ce rôle')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Supprimer…' })).toBeNull()
    expect(screen.getByText(/3 compte\(s\) portent encore/)).toBeDefined()
  })

  it('signale un rôle qui n’ouvre aucun dossier', () => {
    afficher([ROLE_CREE])

    expect(screen.getByText('Créé ici')).toBeDefined()
    expect(screen.getByText(/N’ouvre aucun dossier/)).toBeDefined()
  })
})

/** `hidden` sur un ancêtre : jsdom n'applique pas la feuille de style, on lit l'attribut. */
function estVisible(element: HTMLElement): boolean {
  for (let n: HTMLElement | null = element; n !== null; n = n.parentElement) {
    if (n.hasAttribute('hidden')) return false
  }
  return true
}
