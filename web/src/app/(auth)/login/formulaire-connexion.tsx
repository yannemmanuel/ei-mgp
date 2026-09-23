'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { seConnecter, type EtatConnexion } from './actions'
import { useRetourEnToast } from '@/lib/retour-operation'

const ETAT_INITIAL: EtatConnexion = {}

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, ETAT_INITIAL)
  useRetourEnToast(etat)

  return (
    <form action={action} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>


      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  )
}
