// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EtatFormulaire, LigneReferentiel } from '../editeur-referentiel'

/**
 * L'éditeur commun aux référentiels, exercé dans un vrai DOM.
 *
 * ⚠️ LE DÉFAUT QUE CE FICHIER PROTÈGE N'ÉTAIT PAS UN AVERTISSEMENT DE CONSOLE.
 *
 * Base UI signalait « a component is changing the default value state of an uncontrolled
 * FieldControl after being initialized ». Derrière ce message, une corruption silencieuse : les
 * champs du formulaire sont NON CONTRÔLÉS et amorcés par `defaultValue`. React ignore un
 * `defaultValue` qui change sur un champ déjà monté — le DOM garde l'ancienne valeur.
 *
 * Le bouton « Modifier » est offert sur CHAQUE ligne, y compris pendant qu'on en édite une autre.
 * L'enchaînement était donc :
 *
 *   1. « Modifier » sur la ligne A — le formulaire montre les valeurs de A ;
 *   2. « Modifier » sur la ligne B — l'identifiant caché passe à B, car il est contrôlé…
 *      mais les champs affichent toujours A ;
 *   3. « Enregistrer » — la ligne B est écrasée par le libellé de la ligne A.
 *
 * Aucune erreur, aucun refus : le mauvais enregistrement aboutit. Les six écrans de référentiel
 * partagent ce composant.
 */
const inerte = async (): Promise<EtatFormulaire> => ({})

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { EditeurReferentiel } = await import('../editeur-referentiel')

afterEach(cleanup)

const LIGNES: LigneReferentiel[] = [
  {
    id: '1',
    cellules: ['Première'],
    valeurs: { libelle: 'Première', actif: true },
  },
  {
    id: '2',
    cellules: ['Seconde'],
    valeurs: { libelle: 'Seconde', actif: false },
  },
]

function afficher() {
  render(
    <EditeurReferentiel
      titre="Référentiel de test"
      colonnes={['Libellé']}
      lignes={LIGNES}
      champs={[
        { type: 'texte', nom: 'libelle', libelle: 'Libellé', requis: true, max: 255 },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={inerte}
      creationPossible
      libelleCreation="Ajouter"
    />
  )

  return userEvent.setup()
}

const champLibelle = () => screen.getByLabelText(/Libellé/i) as HTMLInputElement
const champActif = () => screen.getByLabelText('Actif') as HTMLInputElement

/** Les boutons « Modifier » de chaque ligne, dans l'ordre du tableau. */
const boutonsModifier = () => screen.getAllByRole('button', { name: 'Modifier' })

describe('⚠️ Changer de ligne en cours d’édition', () => {
  it('⚠️ recharge les champs avec les valeurs de la NOUVELLE ligne', async () => {
    /*
      Le cas qui reproduit la corruption. Sans remontage des champs, le second « Modifier »
      laissait « Première » affiché alors que l'identifiant soumis était celui de la seconde.
    */
    const clavier = afficher()

    await clavier.click(boutonsModifier()[0])
    expect(champLibelle().value).toBe('Première')

    await clavier.click(boutonsModifier()[1])

    await waitFor(() =>
      expect(
        champLibelle().value,
        'le formulaire affiche encore la ligne précédente : enregistrer écraserait la mauvaise'
      ).toBe('Seconde')
    )

    // La case suit aussi : « Seconde » est inactive, « Première » ne l'était pas.
    expect(champActif().checked, 'la case garde l’état de la ligne précédente').toBe(false)
  })

  it('⚠️ soumet bien l’identifiant de la ligne affichée', async () => {
    // La moitié qui rendait le défaut silencieux : l'identifiant, lui, est contrôlé et suivait
    // déjà. C'est l'écart entre les deux qui écrasait la mauvaise ligne.
    const clavier = afficher()

    await clavier.click(boutonsModifier()[0])
    await clavier.click(boutonsModifier()[1])

    const id = document.querySelector<HTMLInputElement>('input[type="hidden"][name="id"]')

    expect(id?.value, 'l’identifiant soumis n’est pas celui de la ligne affichée').toBe('2')
    expect(champLibelle().value).toBe('Seconde')
  })

  it('vide les champs quand on ouvre la CRÉATION après une édition', async () => {
    /*
      Le même risque par l'autre bout : un formulaire de création pré-rempli avec la ligne qu'on
      venait d'éditer ferait créer un doublon sans qu'on s'en aperçoive — le libellé paraissant
      simplement « déjà saisi ».

      ⚠️ Le bouton « Ajouter » DISPARAÎT tant qu'une édition est ouverte : il faut annuler d'abord.
      Ce cas fige donc le chemin réellement atteignable, et vérifie qu'il repart propre.
    */
    const clavier = afficher()

    await clavier.click(boutonsModifier()[0])
    expect(champLibelle().value).toBe('Première')

    await clavier.click(screen.getByRole('button', { name: 'Annuler' }))
    await clavier.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(
        champLibelle().value,
        'le formulaire de création s’ouvre pré-rempli avec la ligne éditée'
      ).toBe('')
    )
  })

  it('ne perd PAS une saisie en cours sur la même ligne', async () => {
    /*
      La contrepartie. Remonter les champs à chaque rendu effacerait ce qu'on est en train de
      taper : le composant se rerend à chaque frappe, et la saisie disparaîtrait lettre à lettre.
      Le remontage ne doit se produire QUE lorsque la ligne éditée change.
    */
    const clavier = afficher()

    await clavier.click(boutonsModifier()[0])
    await clavier.clear(champLibelle())
    await clavier.type(champLibelle(), 'Saisie en cours')

    expect(champLibelle().value, 'la saisie a été effacée par un remontage intempestif').toBe(
      'Saisie en cours'
    )
  })
})
