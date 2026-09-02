'use client'

import { useActionState } from 'react'
import { seConnecter, type EtatConnexion } from './actions'

const ETAT_INITIAL: EtatConnexion = {}

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, ETAT_INITIAL)

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-slate-600">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-slate-600">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {etat.erreur && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
