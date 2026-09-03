import type { Metadata } from 'next'
import { FormulaireSuivi } from './formulaire-suivi'

export const metadata: Metadata = {
  title: 'Suivre mon dossier',
}

export default function PageSuivi() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-h1 text-secondary-900">Suivre mon dossier</h1>
      <p className="mt-2 text-sm text-secondary-600">
        Saisissez le numéro de référence et le code d’accès qui vous ont été remis lors de votre
        déclaration.
      </p>

      <FormulaireSuivi />
    </div>
  )
}
