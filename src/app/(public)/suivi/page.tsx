import type { Metadata } from 'next'
import { FormulaireSuivi } from './formulaire-suivi'

export const metadata: Metadata = {
  title: 'Suivre mon dossier',
}

/**
 * Largeur portée à `max-w-3xl` pour la frise horizontale des états ; le formulaire de recherche
 * se resserre de lui-même (`max-w-lg`). Le titre est rendu par le composant, qui sait s'il
 * affiche la recherche ou le dossier.
 */
export default function PageSuivi() {
  return (
    <div className="mx-auto max-w-3xl">
      <FormulaireSuivi />
    </div>
  )
}
