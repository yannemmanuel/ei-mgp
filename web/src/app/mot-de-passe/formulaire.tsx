'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { actionChangerMotDePasse, type EtatMotDePasse } from './actions'
import { useRetourEnToast } from '@/lib/retour-operation'

const ETAT: EtatMotDePasse = {}

/**
 * Les contrôles côté navigateur ne font que devancer ceux du serveur, qui restent les seuls à
 * faire autorité — `changerMotDePasse()` revérifie tout, y compris la longueur en octets.
 */
export function FormulaireMotDePasse({
  longueurMinimale,
  octetsMaximum,
}: {
  longueurMinimale: number
  octetsMaximum: number
}) {
  const [etat, envoyer, enCours] = useActionState(actionChangerMotDePasse, ETAT)
  useRetourEnToast(etat)
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const octets = new TextEncoder().encode(nouveau).length
  const tropCourt = nouveau !== '' && nouveau.length < longueurMinimale
  const tropLong = octets > octetsMaximum
  const divergent = confirmation !== '' && confirmation !== nouveau

  return (
    <form action={envoyer} className="space-y-5">
      <div>
        <Label htmlFor="actuel">Mot de passe actuel</Label>
        <Input
          id="actuel"
          name="actuel"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1"
        />
        <p className="mt-1 text-caption text-muted-foreground">
          Demandé même si vous êtes déjà connecté, pour vérifier que c’est bien vous.
        </p>
      </div>

      <div>
        <Label htmlFor="nouveau">Nouveau mot de passe</Label>
        <Input
          id="nouveau"
          name="nouveau"
          type="password"
          autoComplete="new-password"
          required
          minLength={longueurMinimale}
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          className="mt-1"
        />
        <p
          className={`mt-1 text-caption ${
            tropCourt || tropLong ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {tropLong
            ? 'Trop long. Raccourcissez-le un peu.'
            : `${longueurMinimale} caractères au moins. Une phrase dont vous vous souvenez fait un très bon mot de passe.`}
        </p>
      </div>

      <div>
        <Label htmlFor="confirmation">Confirmer le nouveau mot de passe</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="mt-1"
        />
        {divergent && (
          <p className="mt-1 text-caption text-destructive">
            Les deux saisies ne correspondent pas.
          </p>
        )}
      </div>


      <Button type="submit" disabled={enCours || tropCourt || tropLong || divergent}>
        {enCours ? 'Enregistrement…' : 'Changer mon mot de passe'}
      </Button>

    </form>
  )
}
