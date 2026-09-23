// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

/**
 * Le raccord entre le retour d'une Server Action et la notification.
 *
 * Deux pièges y vivent, et aucun ne se voit en lisant l'appel :
 *
 * - notifier à chaque RENDU plutôt qu'à chaque résultat — la notification reviendrait alors
 *   toute seule, après une revalidation ou le changement d'un état voisin ;
 * - ne notifier qu'au CHANGEMENT DE MESSAGE — deux échecs identiques de suite ne produiraient
 *   qu'une notification, et la seconde tentative paraîtrait n'avoir rien donné.
 *
 * `sonner` est le seul module remplacé : il écrit dans le DOM par un portail monté ailleurs, et
 * ce qu'on veut observer ici, ce sont les APPELS.
 */
const appels: { nature: 'succes' | 'erreur'; message: string }[] = []

vi.mock('sonner', () => ({
  toast: {
    success: (message: string) => appels.push({ nature: 'succes', message }),
    error: (message: string) => appels.push({ nature: 'erreur', message }),
  },
}))

const { useRetourEnToast } = await import('../retour-operation')
type Retour = { succes?: string; erreur?: string }

function Sonde({ etat }: { etat: Retour }) {
  useRetourEnToast(etat)
  return null
}

beforeEach(() => {
  appels.length = 0
})

afterEach(cleanup)

describe('Retour d’opération en notification', () => {
  it('ne notifie RIEN au montage', () => {
    // L'état initial d'un `useActionState` ne porte aucun message : rien ne s'est encore produit.
    render(<Sonde etat={{}} />)

    expect(appels).toEqual([])
  })

  it('distingue le succès de l’échec', () => {
    const { rerender } = render(<Sonde etat={{}} />)

    rerender(<Sonde etat={{ succes: 'Catégorie enregistrée.' }} />)
    rerender(<Sonde etat={{ erreur: 'Ce code est déjà utilisé.' }} />)

    expect(appels).toEqual([
      { nature: 'succes', message: 'Catégorie enregistrée.' },
      { nature: 'erreur', message: 'Ce code est déjà utilisé.' },
    ])
  })

  it('ne notifie PAS deux fois pour un simple re-rendu', () => {
    // Le piège principal. Une revalidation, ou un état voisin qui change, re-rend le composant
    // avec le MÊME objet de retour : la notification ne doit pas revenir sans raison.
    const resultat: Retour = { succes: 'Ordre mis à jour.' }
    const { rerender } = render(<Sonde etat={{}} />)

    rerender(<Sonde etat={resultat} />)
    rerender(<Sonde etat={resultat} />)
    rerender(<Sonde etat={resultat} />)

    expect(appels).toHaveLength(1)
  })

  it('notifie DE NOUVEAU quand le même message revient d’une autre exécution', () => {
    // Le piège inverse, qu'une comparaison sur le texte aurait ouvert : deux tentatives qui
    // échouent de la même façon doivent produire deux notifications, sans quoi la seconde
    // paraîtrait n'avoir rien déclenché.
    const { rerender } = render(<Sonde etat={{}} />)

    rerender(<Sonde etat={{ erreur: 'Cette entrée est déjà la première.' }} />)
    rerender(<Sonde etat={{ erreur: 'Cette entrée est déjà la première.' }} />)

    expect(appels).toHaveLength(2)
    expect(appels.every((a) => a.nature === 'erreur')).toBe(true)
  })

  it('n’annonce que le succès quand les deux sont présents', () => {
    // Cas de garde : une action ne devrait jamais rendre les deux, mais si cela arrivait, deux
    // notifications contradictoires en même temps seraient pires que le choix d'une seule.
    render(<Sonde etat={{ succes: 'Enregistré.', erreur: 'Échec.' }} />)

    expect(appels).toEqual([{ nature: 'succes', message: 'Enregistré.' }])
  })
})
