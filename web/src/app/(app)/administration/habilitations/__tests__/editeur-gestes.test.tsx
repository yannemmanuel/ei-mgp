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
 * Les colonnes de la grille des étapes et le catalogue des comportements, tels que le serveur les
 * envoie. Deux étapes et deux comportements suffisent à exercer l'écran.
 */
const ETAPES_TEST = [
  { code: 'affecte', libelle: 'Affecté' },
  { code: 'en_analyse', libelle: 'En analyse' },
]

const COMPORTEMENTS_TEST = [
  { cle: 'traite_dossiers', libelle: 'A la charge des dossiers de son périmètre', aide: 'Titulaire.' },
  { cle: 'cloisonne_par_rattachement', libelle: 'Borné à son site ou à sa direction', aide: 'Périmètre.' },
  {
    cle: 'voit_seulement_ses_declarations',
    libelle: 'Ne voit que ses propres déclarations',
    aide: 'Déclarant.',
  },
  {
    cle: 'voit_identite_declarant',
    libelle: "Voit l'identité du déclarant",
    aide: 'Sans données nominatives si décoché.',
  },
]

/** Les trois listes que l'écran reçoit toujours ensemble. */
const REFERENTIELS = {
  parcoursDisponibles: PARCOURS_TEST,
  etapesDisponibles: ETAPES_TEST,
  comportementsDisponibles: COMPORTEMENTS_TEST,
}


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
  actionChangerComportementsRole: async () => ({}),
  actionModifierEtapesRole: async () => ({}),
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
  parcours: [
    {
      code: 'ei_employe',
      libelle: 'Événement Indésirable (Employé)',
      alerteCircuitCritique: true,
    },
  ],
  tousLesParcours: false,
  comportements: {
    traite_dossiers: false,
    cloisonne_par_rattachement: true,
    voit_seulement_ses_declarations: false,
    voit_identite_declarant: true,
  },
  etapes: [{ parcours: 'ei_employe', statut: 'affecte' }],
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
  comportements: {
    traite_dossiers: false,
    cloisonne_par_rattachement: false,
    voit_seulement_ses_declarations: false,
    // Vrai par défaut : c'est le RETRAIT qui se coche.
    voit_identite_declarant: true,
  },
  etapes: [],
}

function afficher(roles: RoleVue[] = [ROLE]) {
  render(<EditeurHabilitations roles={roles} domaines={DOMAINES} {...REFERENTIELS} />)
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

describe('⚠️ La grille « qui fait avancer quoi »', () => {
  /*
    ⚠️ LE RÉGLAGE LE PLUS SILENCIEUX DU DISPOSITIF, et celui que l'écran n'offrait pas.

    Il vivait dans une table du code : un rôle créé depuis l'interface n'y figurait pas, ses
    porteurs voyaient le dossier, portaient le droit de le faire avancer, et le bouton restait
    absent sans qu'aucun message ne l'explique. Ces cas tiennent les deux moitiés du geste : la
    grille montre ce qui est ENREGISTRÉ, et elle SOUMET ce qui est coché.
  */
  it('montre une case par type et par étape, cochée d’après le rôle', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: /Étapes/ }))

    // Deux types × deux étapes dans le jeu de test : la grille doit les proposer toutes.
    for (const etape of ['Affecté', 'En analyse']) {
      for (const type of ['Événement Indésirable (Employé)', 'Grief / plainte (Employé)']) {
        expect(
          screen.getByLabelText(`${etape} — ${type}`),
          `la case ${etape} × ${type} manque`
        ).toBeDefined()
      }
    }

    // ROLE porte `ei_employe/affecte` : elle seule doit être cochée.
    const cochee = screen.getByLabelText(
      'Affecté — Événement Indésirable (Employé)'
    ) as HTMLInputElement
    const vide = screen.getByLabelText(
      'En analyse — Événement Indésirable (Employé)'
    ) as HTMLInputElement

    expect(cochee.checked, 'la grille ne montre pas ce qui est enregistré').toBe(true)
    expect(vide.checked).toBe(false)
  })

  it('⚠️ soumet « type/étape », la forme que la Server Action attend', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: /Étapes/ }))

    await clavier.click(screen.getByLabelText('En analyse — Grief / plainte (Employé)'))

    // Ce que le serveur lira : les champs eux-mêmes, pas l'état des cases.
    const envoyes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="etapes"]')
    )
      .filter((champ) => champ.checked)
      .map((champ) => champ.value)

    expect(envoyes.sort()).toEqual(['ei_employe/affecte', 'grief_employe/en_analyse'])
  })

  it('coche et décoche une COLONNE entière', async () => {
    // Vingt-huit cases à cocher une à une décourage le paramétrage, et c'est ainsi qu'une grille
    // reste à moitié remplie.
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: /Étapes/ }))

    const colonne = screen
      .getAllByRole('button', { name: /Tout cocher|Tout décocher/ })
      .find((bouton) => bouton.closest('th')?.textContent?.includes('Grief'))

    expect(colonne, 'la colonne n’offre aucun geste d’ensemble').toBeDefined()
    if (!colonne) return

    await clavier.click(colonne)

    for (const etape of ['Affecté', 'En analyse']) {
      expect(
        (screen.getByLabelText(`${etape} — Grief / plainte (Employé)`) as HTMLInputElement).checked,
        `${etape} n’a pas suivi le geste d’ensemble`
      ).toBe(true)
    }

    // Et l'autre colonne n'a pas bougé : le geste est borné à la sienne.
    expect(
      (screen.getByLabelText('En analyse — Événement Indésirable (Employé)') as HTMLInputElement)
        .checked
    ).toBe(false)
  })

  it('⚠️ avertit quand la grille est VIDE', async () => {
    // Aucune case cochée : les porteurs ne feront avancer aucun dossier, même s'ils en ont le
    // droit et qu'ils le voient. C'est un paramétrage muet, et l'écran doit le dire.
    const clavier = afficher([ROLE_CREE])
    await ouvrir(clavier, 'Gestionnaire des supports')
    await clavier.click(screen.getByRole('tab', { name: /Étapes/ }))

    expect(screen.getByText(/ne pourront faire avancer aucun dossier/)).toBeDefined()
  })

  it('signale une colonne dont le TYPE n’est pas ouvert', async () => {
    // On paramètre souvent la grille avant d'ouvrir le type. Les cases restent cochables — la
    // mention explique simplement pourquoi rien ne se passe encore.
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: /Étapes/ }))

    expect(screen.getAllByText('type non ouvert').length).toBe(1)
  })
})

describe('⚠️ Les quatre comportements du rôle', () => {
  it('montre chacun avec son libellé et son explication', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Comportement' }))

    for (const libelle of [
      'A la charge des dossiers de son périmètre',
      'Borné à son site ou à sa direction',
      'Ne voit que ses propres déclarations',
      "Voit l'identité du déclarant",
    ]) {
      expect(screen.getByLabelText(new RegExp(libelle)), `« ${libelle} » manque`).toBeDefined()
    }
  })

  it('reprend l’état enregistré, y compris le vrai PAR DÉFAUT', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Comportement' }))

    // ⚠️ « Voit l'identité » est vrai par défaut : c'est le RETRAIT qui se coche. Le montrer
    // décoché ferait croire à un accès sans données nominatives là où il n'y en a pas.
    expect(
      (screen.getByLabelText(/Voit l'identité du déclarant/) as HTMLInputElement).checked
    ).toBe(true)
    expect(
      (screen.getByLabelText(/Borné à son site ou à sa direction/) as HTMLInputElement).checked
    ).toBe(true)
    expect(
      (screen.getByLabelText(/A la charge des dossiers/) as HTMLInputElement).checked
    ).toBe(false)
  })

  it('⚠️ prévient au moment où l’on retire l’identité du déclarant', async () => {
    /*
      Le seul de ces réglages dont l'effet ne se voit nulle part depuis l'administration : les
      fiches continuent de s'afficher, simplement amputées du nom. Le dire au moment du geste est
      la seule occasion.
    */
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Comportement' }))

    expect(screen.queryByText(/sans jamais voir qui a déclaré/)).toBeNull()

    await clavier.click(screen.getByLabelText(/Voit l'identité du déclarant/))

    expect(screen.getByText(/sans jamais voir qui a déclaré/)).toBeDefined()
  })

  it('soumet les clés du catalogue, pas les libellés', async () => {
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Comportement' }))
    await clavier.click(screen.getByLabelText(/A la charge des dossiers/))

    const envoyes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="comportements"]')
    )
      .filter((champ) => champ.checked)
      .map((champ) => champ.value)

    expect(envoyes.sort()).toEqual([
      'cloisonne_par_rattachement',
      'traite_dossiers',
      'voit_identite_declarant',
    ])
  })
})

describe('⚠️ L’alerte de circuit accéléré, par type de déclaration', () => {
  it('ne s’offre que sous un type OUVERT', async () => {
    /*
      Elle vit sur la même ligne que le type en base : un type non coché n'a aucun support pour
      la porter. L'offrir quand même laisserait cocher quelque chose qui ne serait pas enregistré.
    */
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: /Déclarations/ }))

    // ROLE ouvre `ei_employe` seulement : une seule case d'alerte.
    expect(screen.getAllByLabelText(/Alerté en circuit accéléré/).length).toBe(1)

    // On ouvre le second type : sa case d'alerte apparaît.
    await clavier.click(screen.getByLabelText('Grief / plainte (Employé)'))

    expect(screen.getAllByLabelText(/Alerté en circuit accéléré/).length).toBe(2)
  })

  it('⚠️ décocher le TYPE retire son alerte, à l’écran comme en base', async () => {
    // Les deux vivent sur la même ligne : le type parti, l'alerte l'est aussi. Laisser la case
    // cochée à l'écran aurait laissé croire qu'elle survivait.
    const clavier = afficher()
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: /Déclarations/ }))

    expect(
      (screen.getByLabelText(/Alerté en circuit accéléré/) as HTMLInputElement).checked
    ).toBe(true)

    await clavier.click(screen.getByLabelText('Événement Indésirable (Employé)'))

    expect(screen.queryByLabelText(/Alerté en circuit accéléré/)).toBeNull()

    // Et rien n'est soumis pour ce type, ni le type ni son alerte.
    const circuit = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="circuitCritique"]')
    ).filter((champ) => champ.checked)

    expect(circuit).toEqual([])
  })
})

describe('Créer et supprimer un rôle', () => {
  it('prévient, avant la création, qu’un rôle créé ici n’ouvre aucun dossier', async () => {
    const clavier = afficher()
    await clavier.click(screen.getByRole('button', { name: 'Nouveau rôle' }))

    expect(screen.getByLabelText('Nom affiché')).toBeDefined()
    expect(screen.getByText(/aucun dossier/)).toBeDefined()
  })

  it('⚠️ propose désormais la suppression d’un rôle livré, mais la refuse s’il est porté', async () => {
    /*
      ⚠️ CE CAS A CHANGÉ DE SENS le 2026-09-20.

      L'onglet « Supprimer » était masqué pour les rôles livrés. Il ne l'est plus : seule
      l'attribution décide, et c'est le service qui tranche. Ce qui doit rester, c'est que le
      geste n'aboutisse pas tant qu'un compte porte le rôle — `ROLE` en a deux.
    */
    const clavier = afficher([ROLE])

    await ouvrir(clavier)

    // ⚠️ La désactivation n'est plus dans un onglet : elle est en évidence, toujours visible.
    expect(screen.getByRole('button', { name: 'Désactiver…' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Supprimer' })).toBeDefined()
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

describe('⚠️ Supprimer un rôle : le geste doit être ATTEIGNABLE', () => {
  /*
    ⚠️ LE CAS QUI MANQUAIT, et son absence s'est vue en production.

    La règle « un rôle se supprime dès que personne ne le porte » a été posée côté SERVICE, qui a
    cessé de refuser les rôles livrés. Mais l'écran continuait de masquer l'onglet pour ces
    mêmes rôles : la règle était juste, et le geste introuvable. Un service qu'aucun écran
    n'atteint ne sert à rien, et rien ne le signalait.
  */
  const LIVRE_LIBRE: RoleVue = { ...ROLE, comptes: 0, rattachements: 0 }

  it('offre l’onglet « Supprimer » même sur un rôle LIVRÉ', async () => {
    const clavier = afficher([LIVRE_LIBRE])
    await ouvrir(clavier)

    expect(screen.getByRole('tab', { name: 'Supprimer' })).toBeDefined()
  })

  it('mène jusqu’au bouton quand personne ne porte le rôle', async () => {
    const clavier = afficher([LIVRE_LIBRE])
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Supprimer' }))

    await clavier.click(screen.getByRole('button', { name: 'Supprimer…' }))

    expect(screen.getByRole('button', { name: /Confirmer la suppression/i })).toBeDefined()
  })

  it('⚠️ avertit que le CODE se réfère à ce rôle', async () => {
    // Supprimer un rôle livré ne provoque aucune erreur : les règles qui le nomment cessent
    // simplement de le désigner. Une conséquence qu'on ne découvre que des semaines plus tard
    // doit être dite avant le geste.
    const clavier = afficher([LIVRE_LIBRE])
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Supprimer' }))

    expect(screen.getByText(/nommé par le code/i)).toBeDefined()
  })

  it('n’offre PAS le bouton tant qu’un compte porte le rôle', async () => {
    // La garde qui protège quelqu'un : `ROLE` est porté par deux comptes.
    const clavier = afficher([ROLE])
    await ouvrir(clavier)
    await clavier.click(screen.getByRole('tab', { name: 'Supprimer' }))

    expect(screen.getByText(/portent encore ce rôle/i)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Confirmer la suppression/i })).toBeNull()
  })
})
