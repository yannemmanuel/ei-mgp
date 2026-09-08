'use client'

import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { actionChangerMotDePasse, type EtatMotDePasse } from './actions'

const ETAT: EtatMotDePasse = {}

/**
 * Les contrôles côté navigateur ne font que devancer ceux du serveur, qui restent les seuls à
 * faire autorité — `changerMotDePasse()` revérifie tout, y compris la longueur en octets.
 */
export function FormulaireMotDePasse({
  longueurMinimale,
  octetsMaximum,
  obligatoire,
}: {
  longueurMinimale: number
  octetsMaximum: number
  /** Le mot de passe a été fixé par un tiers : on ne peut pas quitter l'écran sans le changer. */
  obligatoire: boolean
}) {
  const [etat, envoyer, enCours] = useActionState(actionChangerMotDePasse, ETAT)
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
          Exigé même si vous êtes déjà connecté : sans lui, un poste laissé ouvert quelques
          secondes suffirait à s’approprier le compte.
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
            ? `Trop long : ${octets} octets pour ${octetsMaximum} au maximum. Les accents et emojis comptent double ou plus.`
            : `${longueurMinimale} caractères au moins. Aucune règle de composition — une phrase dont vous vous souvenez vaut mieux qu’un assemblage de symboles.`}
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

      {etat.erreur && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{etat.erreur}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={enCours || tropCourt || tropLong || divergent}>
        {enCours ? 'Enregistrement…' : 'Changer mon mot de passe'}
      </Button>

      {!obligatoire && (
        <p className="text-caption text-muted-foreground">
          Vous serez redirigé vers le tableau de bord une fois le changement enregistré.
        </p>
      )}
    </form>
  )
}
