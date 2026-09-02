import type { Metadata } from 'next'
import { exigerUtilisateur } from '@/server/auth'
import { parcoursAutorises } from '@/server/authz'
import { seDeconnecter } from './actions'

export const metadata: Metadata = {
  title: 'Tableau de bord — EI-MGP',
}

/**
 * Page d'atterrissage post-connexion — provisoire.
 *
 * Elle ne sert pour l'instant qu'à prouver que la chaîne session → autorisation fonctionne de
 * bout en bout. Le tableau de bord réel (EX-REP-01/02, avec sa ramification selon
 * `reporting.view` — DT-31) est construit à l'étape 10.
 */
export default async function PageTableauDeBord() {
  const utilisateur = await exigerUtilisateur()

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Tableau de bord</h1>
        <form action={seDeconnecter}>
          <button type="submit" className="text-sm text-slate-500 underline-offset-2 hover:underline">
            Se déconnecter
          </button>
        </form>
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Identifiant</dt>
          <dd className="text-slate-900">{utilisateur.id.toString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Rôles</dt>
          <dd className="text-slate-900">{utilisateur.roles.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Permissions</dt>
          <dd className="text-slate-900">{utilisateur.permissions.size}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Parcours accessibles</dt>
          <dd className="text-slate-900">{parcoursAutorises(utilisateur.roles).join(', ') || '—'}</dd>
        </div>
      </dl>
    </main>
  )
}
