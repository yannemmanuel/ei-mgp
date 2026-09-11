// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_FICHIERS } from '@/lib/limites-pieces-jointes'
import { PARCOURS } from '@/server/services/declaration/parcours-config'
import type { EtatSoumission } from '@/server/services/declaration/soumission'

/**
 * Parcours du formulaire de déclaration, exercé dans un vrai DOM.
 *
 * Les Server Actions ne sont pas appelables hors requête HTTP, et le reste de la suite s'en
 * accommode. Mais deux défauts se sont succédé ICI — des étapes démontées qui effaçaient les
 * saisies, puis un signalement d'étape sautée — et aucun d'eux n'était détectable en lisant le
 * source ou en inspectant le HTML servi : ils vivent dans l'interaction. D'où ce seul fichier à
 * environnement DOM.
 *
 * Le module d'action est le SEUL remplacé, parce qu'il franchit la frontière serveur. Rien de la
 * logique du formulaire ne l'est.
 */
vi.mock('../actions', () => ({
  soumettreDeclaration: async (): Promise<EtatSoumission> => ({}),
}))

const { FormulaireDeclaration } = await import('../formulaire')

const REFERENTIELS = {
  categories: [{ valeur: '1', libelle: 'Condition dangereuse' }],
  categoriesAutre: [],
  niveauxGravite: [{ valeur: '1', libelle: 'Faible' }],
  referentiels: {
    directions: [
      { valeur: '1', libelle: 'Direction Exploitation' },
      { valeur: '2', libelle: 'Direction Financière' },
    ],
    postes: [
      { valeur: 'Technicien réseau', libelle: 'Technicien réseau', parent: '1' },
      { valeur: 'Agent de maintenance', libelle: 'Agent de maintenance', parent: '1' },
      { valeur: 'Comptable', libelle: 'Comptable', parent: '2' },
    ],
    lieux: [{ valeur: 'Station de Yopougon', libelle: 'Station de Yopougon' }],
    villes: [{ valeur: 'Abidjan', libelle: 'Abidjan' }],
    tranchesAnciennete: [{ valeur: '1 à 3 ans', libelle: '1 à 3 ans' }],
  },
}

function afficher(parcours: keyof typeof PARCOURS = 'ei_employe') {
  const soumissions: FormData[] = []

  render(
    <FormulaireDeclaration
      config={PARCOURS[parcours]}
      {...REFERENTIELS}
      soumettre={async (_etat, donnees) => {
        soumissions.push(donnees)
        return {}
      }}
    />
  )

  return { soumissions, utilisateur: userEvent.setup() }
}

afterEach(cleanup)

/** Ce que l'œil voit : un champ dans une étape masquée est présent, mais pas visible. */
const visible = (element: HTMLElement | null) =>
  element !== null && element.closest('.hidden') === null

const boutonEnvoyer = () =>
  screen.getByRole('button', { name: /Envoyer ma déclaration/i }) as HTMLButtonElement

/**
 * Envoie comme le ferait quelqu'un qui a lu l'étape : le bouton s'arme peu après son apparition,
 * et refuse tout jusque-là. Attendre l'armement fait partie du parcours normal, pas du décor de
 * test — c'est ce délai qui distingue la décision d'envoyer du geste qui a mené à l'étape 4.
 */
async function envoyer(utilisateur: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(boutonEnvoyer().disabled, 'bouton d’envoi resté désarmé').toBe(false), {
    timeout: 3_000,
  })
  await utilisateur.click(boutonEnvoyer())
}

/** Les étapes 1 à 3 remplies, curseur posé à l'étape 3, prêt à la quitter. */
async function remplirJusquAEtape3(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
  await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
  await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

  await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
  await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
  await utilisateur.selectOptions(screen.getByLabelText(/^Lieu/i), 'Station de Yopougon')
  await utilisateur.selectOptions(screen.getByLabelText(/Caractère répétitif/i), 'premiere_fois')
  await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

  await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
  await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
  await utilisateur.type(screen.getByLabelText(/Description des faits/i), 'Extincteur vide.')
}

describe('Progression entre les étapes', () => {
  it('atteint l’étape des pièces jointes, et ne la saute pas', async () => {
    const { utilisateur } = afficher()

    // Étape 1 — l'anonymat retire les champs d'identité. La direction, elle, reste demandée :
    // elle porte le rattachement au site, pas l'identité du déclarant.
    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    // Étape 2
    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.selectOptions(screen.getByLabelText(/^Lieu/i), 'Station de Yopougon')
    await utilisateur.selectOptions(screen.getByLabelText(/Caractère répétitif/i), 'premiere_fois')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    // Étape 3
    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
    await utilisateur.type(screen.getByLabelText(/Description des faits/i), 'Extincteur vide.')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    // Étape 4 — c'est celle qui était signalée comme sautée.
    await waitFor(() =>
      expect(visible(screen.getByLabelText(/Pièces jointes/i)), 'étape 4 non atteinte').toBe(true)
    )
    expect(screen.getByRole('button', { name: /Envoyer ma déclaration/i })).toBeDefined()
  })

  it('refuse d’avancer tant qu’un champ obligatoire de l’étape manque', async () => {
    const { utilisateur } = afficher()

    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))

    // « Lieu » est obligatoire et vide : l'étape 2 ne doit pas se quitter.
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(visible(screen.getByLabelText(/Date des faits/i)), 'l’étape 2 a été quittée').toBe(true)
    expect(visible(screen.queryByLabelText(/Catégorie/i))).toBe(false)
  })

  it('conserve les saisies des étapes précédentes jusqu’à l’envoi', async () => {
    const { utilisateur, soumissions } = afficher()

    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.selectOptions(screen.getByLabelText(/^Lieu/i), 'Station de Yopougon')
    await utilisateur.selectOptions(screen.getByLabelText(/Caractère répétitif/i), 'premiere_fois')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
    await utilisateur.type(screen.getByLabelText(/Description des faits/i), 'Extincteur vide.')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Pièces jointes/i))).toBe(true))
    await envoyer(utilisateur)

    await waitFor(() => expect(soumissions).toHaveLength(1))

    // Le défaut d'origine : seules les pièces jointes arrivaient, tout le reste ayant été démonté
    // en chemin.
    const envoi = soumissions[0]
    expect(envoi.get('lieu')).toBe('Station de Yopougon')
    expect(envoi.get('categorieId')).toBe('1')
    expect(envoi.get('description')).toBe('Extincteur vide.')
    expect(envoi.get('anonymat')).not.toBeNull()
  })
})

describe('Champs obligatoires ajoutés le 08/09/2026', () => {
  it('refuse de quitter l’étape 3 sans description des faits', async () => {
    // Un dossier sans récit des faits n'est ni qualifiable ni affectable (RGI-02).
    const { utilisateur } = afficher()

    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.selectOptions(screen.getByLabelText(/^Lieu/i), 'Station de Yopougon')
    await utilisateur.selectOptions(screen.getByLabelText(/Caractère répétitif/i), 'premiere_fois')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')

    // Tout est rempli SAUF la description.
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(visible(screen.getByLabelText(/Catégorie/i)), 'l’étape 3 a été quittée').toBe(true)
    expect(visible(screen.queryByLabelText(/Pièces jointes/i))).toBe(false)
  })

  it('accepte une description COURTE — le plancher reste levé', async () => {
    const { utilisateur } = afficher()

    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.selectOptions(screen.getByLabelText(/^Lieu/i), 'Station de Yopougon')
    await utilisateur.selectOptions(screen.getByLabelText(/Caractère répétitif/i), 'premiere_fois')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
    // 16 caractères : exactement le signalement que le plancher de RGI-02 écartait.
    await utilisateur.type(screen.getByLabelText(/Description des faits/i), 'Fuite gaz zone B')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Pièces jointes/i))).toBe(true))
  })

  it('exige le matricule du déclarant qui se nomme, et ne le demande pas en anonyme', async () => {
    // RGI-14. Le matricule est une donnée d'identité : exigé de qui s'identifie, absent du
    // formulaire — donc jamais collecté — de qui choisit l'anonymat (RGI-03, RG-06).
    const { utilisateur } = afficher()

    expect(visible(screen.getByLabelText(/Matricule/i))).toBe(true)

    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    // Le matricule manque : l'étape 1 ne se quitte pas.
    expect(visible(screen.getByLabelText(/Matricule/i)), 'l’étape 1 a été quittée').toBe(true)
    expect(visible(screen.queryByLabelText(/Date des faits/i))).toBe(false)

    // En anonyme, le champ n'existe simplement plus : rien à exiger.
    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    expect(screen.queryByLabelText(/Matricule/i)).toBeNull()

    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
  })
})

describe('Le geste de trop', () => {
  /*
   * Un même défaut, quatre gestes.
   *
   * « Continuer » et « Envoyer ma déclaration » occupent la même place : toute répétition du geste
   * qui quitte l'étape 3 atteignait l'envoi, et l'étape des pièces jointes était franchie sans
   * avoir été vue. Le premier correctif ne fermait que la rafale souris ; le signalement a
   * continué. Les quatre gestes sont donc exercés séparément — ils empruntent des routes
   * différentes (focus hérité pour le clavier, coordonnées pour le pointeur) et se refermeraient
   * séparément.
   *
   * Chacun vérifie DEUX choses : que rien n'est parti, et que l'étape 4 est bien affichée. La
   * seconde compte autant : un correctif qui bloquerait aussi l'avancement « réglerait » le
   * symptôme en cassant le parcours.
   */
  const gestes: [string, (u: ReturnType<typeof userEvent.setup>, b: HTMLElement) => Promise<void>][] =
    [
      ['un double-clic', (u, b) => u.dblClick(b)],
      [
        'deux clics distincts, hors rafale',
        async (u, b) => {
          await u.click(b)
          await u.click(b)
        },
      ],
      [
        'deux pressions sur Entrée',
        async (u, b) => {
          b.focus()
          await u.keyboard('{Enter}{Enter}')
        },
      ],
      [
        'Entrée puis Espace',
        async (u, b) => {
          b.focus()
          await u.keyboard('{Enter} ')
        },
      ],
    ]

  it.each(gestes)('%s sur « Continuer » n’envoie pas la déclaration', async (_libelle, geste) => {
    const { utilisateur, soumissions } = afficher()
    await remplirJusquAEtape3(utilisateur)

    await geste(utilisateur, screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() =>
      expect(visible(screen.getByLabelText(/Pièces jointes/i)), 'étape 4 non atteinte').toBe(true)
    )
    expect(soumissions, 'la déclaration est partie sans passer par les pièces jointes').toHaveLength(
      0
    )
  })

  it('laisse ensuite joindre un fichier, puis envoyer', async () => {
    // La contrepartie du blocage : ce qui précède ne doit rien coûter au parcours normal. Après le
    // geste de trop, la personne est à l'étape 4, peut joindre une pièce et envoyer — une fois.
    const { utilisateur, soumissions } = afficher()
    await remplirJusquAEtape3(utilisateur)

    await utilisateur.dblClick(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(visible(screen.getByLabelText(/Pièces jointes/i))).toBe(true))

    const champFichier = screen.getByLabelText(/Pièces jointes/i) as HTMLInputElement
    await utilisateur.upload(champFichier, new File(['constat'], 'constat.pdf', { type: 'application/pdf' }))

    // La pièce est vérifiée SUR LE CHAMP, pas dans l'envoi : `user-event` simule `files` par une
    // propriété JavaScript, tandis que jsdom construit le FormData depuis son emplacement interne,
    // qu'il n'expose pas (pas de `DataTransfer`). Le fichier arriverait vide, par limite de
    // l'environnement et non du formulaire. Ce que ce test doit établir tient de toute façon
    // ailleurs : le champ est atteignable et accepte le fichier, et l'envoi part une seule fois.
    expect(champFichier.files?.[0]?.name).toBe('constat.pdf')

    await envoyer(utilisateur)

    await waitFor(() => expect(soumissions).toHaveLength(1))
    expect(soumissions).toHaveLength(1)
  })

  it('refuse d’envoyer un lot au-delà des bornes annoncées, sans transmettre les octets', async () => {
    // Le formulaire annonce « 10 fichiers maximum » : il doit le faire respecter AVANT l'envoi.
    // Sans ce contrôle, le lot part quand même et n'est refusé qu'une fois tous les octets
    // transmis — au mieux par le serveur, au pire par le plafond de transport de la Server
    // Action, dont le rejet ne produit aucun message que le formulaire sache afficher.
    const { utilisateur, soumissions } = afficher()
    await remplirJusquAEtape3(utilisateur)
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(visible(screen.getByLabelText(/Pièces jointes/i))).toBe(true))

    const champFichier = screen.getByLabelText(/Pièces jointes/i) as HTMLInputElement
    await utilisateur.upload(
      champFichier,
      Array.from(
        { length: MAX_FICHIERS + 1 },
        (_, i) => new File(['x'], `piece-${i}.pdf`, { type: 'application/pdf' })
      )
    )

    await envoyer(utilisateur)

    expect(soumissions, 'un lot hors bornes a été transmis').toHaveLength(0)
    expect(await screen.findByText(new RegExp(`maximum de ${MAX_FICHIERS} fichiers`, 'i'))).toBeDefined()
  })

  it('pose le curseur dans l’étape qui vient d’apparaître', async () => {
    // C'est ce qui ferme la route du clavier : rester sur « Continuer » après le changement
    // d'étape, c'était garder le doigt sur la détente. Et c'est aussi ce qu'attend quelqu'un qui
    // navigue au clavier ou au lecteur d'écran.
    const { utilisateur } = afficher()
    await remplirJusquAEtape3(utilisateur)

    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/Pièces jointes/i))
    )
  })
})

/**
 * Cascade Direction → Poste (EI6).
 *
 * Le piège n'est pas de remplir la liste, c'est de la VIDER : changer de direction ne doit pas
 * laisser sélectionné un poste appartenant à l'ancienne, qui partirait au serveur silencieusement
 * incohérent. Le navigateur s'en charge — une option disparue cesse d'être sélectionnée — mais
 * rien ne le garantissait jusqu'ici, et une future liste contrôlée le perdrait sans bruit. Ces
 * cas fixent le comportement attendu plutôt que de faire confiance à un effet de bord.
 *
 * ⚠️ Le serveur ne s'en remet pas à cet écran : `verifier-referentiels.ts` refuse un poste réel
 * rattaché à une autre direction, cascade respectée ou non.
 */
describe('Poste dépendant de la direction', () => {
  const poste = () => screen.getByLabelText(/^Poste/i) as HTMLSelectElement

  const optionsDuPoste = () =>
    Array.from(poste().options)
      .map((o) => o.value)
      .filter((v) => v !== '')

  it('reste vide et désactivé tant qu’aucune direction n’est choisie', () => {
    afficher()

    expect(poste().disabled, 'la liste des postes est utilisable sans direction').toBe(true)
    expect(optionsDuPoste()).toEqual([])
  })

  it('ne propose que les postes de la direction retenue', async () => {
    const { utilisateur } = afficher()

    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')

    expect(poste().disabled).toBe(false)
    // « Comptable » appartient à la direction 2 : il n'a rien à faire ici.
    expect(optionsDuPoste()).toEqual(['Technicien réseau', 'Agent de maintenance'])
  })

  it('oublie le poste choisi quand la direction change', async () => {
    const { utilisateur } = afficher()

    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '1')
    await utilisateur.selectOptions(poste(), 'Technicien réseau')
    expect(poste().value).toBe('Technicien réseau')

    await utilisateur.selectOptions(screen.getByLabelText(/Direction concernée/i), '2')

    expect(poste().value, 'un poste de l’ancienne direction est resté sélectionné').toBe('')
    expect(optionsDuPoste()).toEqual(['Comptable'])
  })
})
