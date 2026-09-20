// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DomaineVue, RoleVue } from '../editeur'

/** Les types proposés à la coche : deux suffisent à exercer l'écran. */
const PARCOURS_TEST = [
  { code: 'ei_employe', libelle: 'Événement Indésirable (Employé)' },
  { code: 'grief_employe', libelle: 'Grief / plainte (Employé)' },
]


/**
 * Les GESTES de l'écran des habilitations, exercés dans un vrai DOM.
 *
 * Fichier distinct de `editeur.test.tsx`, qui couvre une autre question — ce que le formulaire
 * d'identité affiche après un enregistrement. Les deux portent sur le même composant sans se
 * recouvrir : ici les onglets, la recherche et la suppression ; là-bas la revalidation.
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
  actionModifierParcoursRole: async () => ({}),
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
  parcours: [{ code: 'Événement Indésirable (Employé)', libelle: 'Événement Indésirable (Employé)' }],
  tousLesParcours: false,
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
  tousLesParcours: false,
}

function afficher(roles: RoleVue[] = [ROLE]) {
  render(<EditeurHabilitations roles={roles} domaines={DOMAINES} parcoursDisponibles={PARCOURS_TEST} />)
  return userEvent.setup()
}

/**
 * Ouvre un rôle en le choisissant dans la liste de GAUCHE.
 *
 * L'écran était fait de fiches dépliantes, qu'on ouvrait par un bouton « Modifier » ; il est
 * désormais en maître-détail. Le geste change, la garantie non : les cases à cocher n'existent
 * qu'une fois un rôle choisi.
 */
async function ouvrir(clavier: ReturnType<typeof userEvent.setup>, libelle = 'Secrétaire CSST') {
  await clavier.click(screen.getByRole('button', { name: new RegExp(libelle) }))
}

afterEach(cleanup)

describe('La disposition : rôles à gauche, droits à droite', () => {
  it('range les rôles par ORDRE ALPHABÉTIQUE', () => {
    /*
      L'ordre venait de la base, c'est-à-dire de nulle part : chercher un rôle parmi vingt
      revenait à tous les parcourir. Les trois libellés ci-dessous sont fournis à CONTRE-SENS de
      l'alphabet — si le classement suivait encore l'ordre reçu, « Zoologiste » sortirait premier.
    */
    const r = (role: string, libelle: string): RoleVue => ({ ...ROLE, role, libelle })

    afficher([r('z', 'Zoologiste'), r('e', 'Équipe d’astreinte'), r('a', 'Auditeur')])

    const liste = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => /Zoologiste|Équipe|Auditeur/.test(t))

    // « Équipe » après « Auditeur » et avant « Zoologiste » : `localeCompare` en français range
    // l'accent où on l'attend, là où un tri brut renverrait le « É » en fin de liste.
    expect(liste.map((t) => t.split(' · ')[0].replace(/\d.*/, '').trim())).toEqual([
      'Auditeur',
      'Équipe d’astreinte',
      'Zoologiste',
    ])
  })

  it('⚠️ offre la désactivation SANS ouvrir d’onglet', async () => {
    /*
      C'est le geste qu'on vient faire quand un rôle pose problème. Il vivait derrière un onglet
      nommé « Désactiver », ce qui supposait de deviner où le chercher ; il est désormais en
      évidence dès le rôle choisi.

      ⚠️ Sa CONFIRMATION reste : « Désactiver… » arme, un second bouton valide. Retirer les droits
      de plusieurs personnes d'un seul clic serait trop léger pour ce que le geste fait.
    */
    const clavier = afficher([ROLE])
    await ouvrir(clavier)

    const bouton = screen.getByRole('button', { name: 'Désactiver…' })
    expect(bouton).toBeDefined()

    await clavier.click(bouton)

    // ⚠️ Le bouton de confirmation, et non le décompte : « 2 personnes » figure aussi dans la
    // liste et dans l'en-tête du panneau. Ce qu'on vérifie est qu'un SECOND geste est exigé.
    expect(
      screen.getByRole('button', { name: /Confirmer la désactivation/ }),
      'la désactivation part au premier clic'
    ).toBeDefined()
  })

  it('ne montre aucun droit tant qu’aucun rôle n’est choisi', () => {
    // La liste de gauche seule : le panneau de droite invite à choisir plutôt que d'afficher un
    // formulaire sans sujet.
    afficher([ROLE])

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText(/Choisissez un rôle/)).toBeDefined()
  })
})

describe('Ce que l’écran montre au repos', () => {
  it('n’affiche aucune case à cocher tant qu’aucun rôle n’est ouvert', () => {
    afficher()

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('Secrétaire CSST')).toBeDefined()
  })

  it('ouvre les droits d’abord, et un seul formulaire à la fois', async () => {
    const clavier = afficher()
    await ouvrir(clavier)

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
    // ⚠️ Un rôle CRÉÉ ICI : lui seul porte l'onglet « Supprimer ». Un rôle livré n'en a que
    // trois, et `{End}` ne prouverait alors rien de plus que `{ArrowRight}`.
    const clavier = afficher([ROLE_CREE])
    await ouvrir(clavier, 'Gestionnaire des supports')

    const droits = screen.getByRole('tab', { name: /Droits/ })
    droits.focus()

    // L'onglet qui suit « Droits » est « Déclarations » depuis que les types de déclaration se
    // cochent ici : la flèche doit l'atteindre comme n'importe quel autre.
    await clavier.keyboard('{ArrowRight}')
    expect(
      screen.getByRole('tab', { name: /Déclarations/ }).getAttribute('aria-selected')
    ).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Déclarations/ }))

    await clavier.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Supprimer' }).getAttribute('aria-selected')).toBe(
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
    await ouvrir(clavier)

    expect(screen.getByLabelText(/Voir les dossiers/)).toBeDefined()
    expect(screen.getByLabelText(/Gérer les comptes/), 'un droit non détenu reste caché').toBeDefined()
  })

  it('filtre les droits sur la recherche, tous domaines confondus', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'comptes')

    expect(screen.getByLabelText(/Gérer les comptes/)).toBeDefined()
    expect(screen.queryByLabelText(/Voir les dossiers/), 'droit hors recherche encore affiché').toBeNull()
  })

  it('cherche aussi dans l’explication, pas seulement dans le nom', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'Fermer un dossier')

    expect(screen.getByLabelText(/Clôturer un dossier/)).toBeDefined()
  })

  it('garde le compte du domaine ENTIER pendant une recherche', async () => {
    // « 2/9 » qui deviendrait « 1/1 » ferait croire à des droits perdus.
    const clavier = afficher()
    await ouvrir(clavier)

    const avant = screen.getByRole('button', { name: /Dossiers/ }).textContent
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'clôturer')

    expect(screen.getByRole('button', { name: /Dossiers/ }).textContent).toBe(avant)
  })

  it('le dit quand rien ne correspond', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.type(screen.getByLabelText('Chercher un droit'), 'marmotte')

    expect(screen.getByText(/Aucun droit ne correspond/)).toBeDefined()
  })
})

describe('Ce qu’un onglet ne doit pas faire disparaître', () => {
  it('conserve les cases cochées quand on passe à l’onglet du nom et qu’on revient', async () => {
    const clavier = afficher()
    await ouvrir(clavier)

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
    await ouvrir(clavier)
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

    await ouvrir(clavier)

    // ⚠️ La désactivation n'est plus dans un onglet : elle est en évidence, toujours visible.
    expect(screen.getByRole('button', { name: 'Désactiver…' })).toBeDefined()
    expect(screen.queryByRole('tab', { name: 'Supprimer' })).toBeNull()
    expect(screen.queryByText('Supprimer ce rôle')).toBeNull()
  })

  it('propose la suppression d’un rôle créé ici', async () => {
    const clavier = afficher([ROLE_CREE])

    await ouvrir(clavier, 'Gestionnaire des supports')
    await clavier.click(screen.getByRole('tab', { name: 'Supprimer' }))

    expect(screen.getByText('Supprimer ce rôle')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Supprimer…' })).toBeDefined()
  })

  it('retire le bouton de suppression tant que des comptes portent le rôle', async () => {
    // Supprimer un rôle rattaché retirerait un accès sans le dire : l'écran indique quoi faire
    // d'abord, plutôt que d'offrir un bouton que le serveur refusera.
    const rattache = { ...ROLE_CREE, rattachements: 3 }
    const clavier = afficher([rattache])

    await ouvrir(clavier, 'Gestionnaire des supports')
    await clavier.click(screen.getByRole('tab', { name: 'Supprimer' }))

    expect(screen.getByText('Supprimer ce rôle')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Supprimer…' })).toBeNull()
    expect(screen.getByText(/3 compte\(s\) portent encore/)).toBeDefined()
  })

  it('signale un rôle qui n’ouvre aucun dossier', async () => {
    // Le détail vit à droite : il faut avoir choisi le rôle pour le lire.
    const clavier = afficher([ROLE_CREE])
    await ouvrir(clavier, 'Gestionnaire des supports')

    expect(screen.getByText('Créé ici')).toBeDefined()
    expect(screen.getByText(/N’ouvre aucun type de déclaration/)).toBeDefined()
  })
})

/** `hidden` sur un ancêtre : jsdom n'applique pas la feuille de style, on lit l'attribut. */
function estVisible(element: HTMLElement): boolean {
  for (let n: HTMLElement | null = element; n !== null; n = n.parentElement) {
    if (n.hasAttribute('hidden')) return false
  }
  return true
}
