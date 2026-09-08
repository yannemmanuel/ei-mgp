// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  directions: [{ valeur: '1', libelle: 'Direction Exploitation' }],
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

describe('Progression entre les étapes', () => {
  it('atteint l’étape des pièces jointes, et ne la saute pas', async () => {
    const { utilisateur } = afficher()

    // Étape 1 — l'anonymat retire les champs d'identité, donc plus rien d'obligatoire ici.
    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    // Étape 2
    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.type(screen.getByLabelText(/^Lieu/i), 'Atelier 3')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    // Étape 3
    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
    await utilisateur.selectOptions(screen.getByLabelText(/Niveau de gravité/i), '1')
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
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.type(screen.getByLabelText(/^Lieu/i), 'Atelier 3')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
    await utilisateur.selectOptions(screen.getByLabelText(/Niveau de gravité/i), '1')
    await utilisateur.type(screen.getByLabelText(/Description des faits/i), 'Extincteur vide.')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Pièces jointes/i))).toBe(true))
    await utilisateur.click(screen.getByRole('button', { name: /Envoyer ma déclaration/i }))

    await waitFor(() => expect(soumissions).toHaveLength(1))

    // Le défaut d'origine : seules les pièces jointes arrivaient, tout le reste ayant été démonté
    // en chemin.
    const envoi = soumissions[0]
    expect(envoi.get('lieu')).toBe('Atelier 3')
    expect(envoi.get('categorieId')).toBe('1')
    expect(envoi.get('description')).toBe('Extincteur vide.')
    expect(envoi.get('anonymat')).not.toBeNull()
  })
})

describe('Le clic de trop', () => {
  it('ne soumet pas la déclaration quand on double-clique sur « Continuer »', async () => {
    // Hypothèse à vérifier sur le signalement « il saute l'étape des pièces jointes pour aller à
    // la fin » : à l'étape 3, « Continuer » est remplacé SUR PLACE par « Envoyer ma déclaration ».
    // Un second clic au même endroit — double-clic, ou clic pendant le rendu — atteindrait le
    // bouton d'envoi, et la déclaration partirait sans que l'étape 4 ait été vue.
    const { utilisateur, soumissions } = afficher()

    await utilisateur.click(screen.getByRole('checkbox', { name: /rester anonyme/i }))
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Date des faits/i))).toBe(true))
    await utilisateur.type(screen.getByLabelText(/Date des faits/i), '2026-09-01')
    await utilisateur.type(screen.getByLabelText(/^Lieu/i), 'Atelier 3')
    await utilisateur.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Catégorie/i))).toBe(true))
    await utilisateur.selectOptions(screen.getByLabelText(/Catégorie/i), '1')
    await utilisateur.selectOptions(screen.getByLabelText(/Niveau de gravité/i), '1')

    await utilisateur.dblClick(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(visible(screen.getByLabelText(/Pièces jointes/i))).toBe(true))
    expect(soumissions, 'la déclaration est partie sans passer par les pièces jointes').toHaveLength(0)
  })
})
