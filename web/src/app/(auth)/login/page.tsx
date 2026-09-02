import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { utilisateurCourant } from '@/server/auth'
import { FormulaireConnexion } from './formulaire-connexion'

export const metadata: Metadata = {
  title: 'Connexion — EI-MGP',
}

/**
 * Page de connexion. Habillage volontairement minimal : le design system (shadcn/ui) arrive à
 * l'étape 4, cette page sera reprise à ce moment-là.
 */
export default async function PageConnexion() {
  // Un utilisateur déjà connecté n'a rien à faire ici (comportement Laravel : `/` redirige
  // vers /dashboard si authentifié).
  if (await utilisateurCourant()) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Connexion</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mécanisme de Gestion des Plaintes
        </p>

        <FormulaireConnexion />
      </div>
    </main>
  )
}
