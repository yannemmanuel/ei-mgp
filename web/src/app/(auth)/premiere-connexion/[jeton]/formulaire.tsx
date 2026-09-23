'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { actionDefinirMotDePasse, type EtatPremiereConnexion } from './actions'
import { useRetourEnToast } from '@/lib/retour-operation'

const ETAT: EtatPremiereConnexion = {}

/**
 * Choix du mot de passe à la première connexion.
 *
 * Les contrôles du navigateur ne font que devancer ceux du serveur, qui restent seuls à faire
 * autorité : `consommerInvitation()` revérifie la longueur, les octets, la concordance des deux
 * saisies, et surtout la validité du lien.
 */
export function FormulairePremiereConnexion({
  jeton,
  email,
  longueurMinimale,
  octetsMaximum,
}: {
  jeton: string
  email: string
  longueurMinimale: number
  octetsMaximum: number
}) {
  const [etat, envoyer, enCours] = useActionState(actionDefinirMotDePasse, ETAT)

  /*
   * Seul l'ÉCHEC part en notification.
   *
   * Ici `succes` n'est pas un message mais un booléen : la réussite remplace tout l'écran par ce
   * qui suit — le mot de passe est en place, voici comment se connecter. Une notification par
   * dessus répéterait à côté ce que la page dit déjà en grand.
   *
   * `useMemo` indexé sur `etat` : un objet reconstruit à chaque rendu ferait revenir la
   * notification sans qu'aucun envoi n'ait eu lieu.
   */
  useRetourEnToast(useMemo(() => ({ erreur: etat.erreur }), [etat]))
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const octets = new TextEncoder().encode(nouveau).length
  const tropCourt = nouveau !== '' && nouveau.length < longueurMinimale
  const tropLong = octets > octetsMaximum
  const divergent = confirmation !== '' && confirmation !== nouveau

  if (etat.succes) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            <p className="font-medium">Votre mot de passe est enregistré.</p>
            <p className="mt-1 text-caption">
              Ce lien ne fonctionnera plus : il n’était valable qu’une fois.
            </p>
          </AlertDescription>
        </Alert>

        {/*
          Un lien, pas une redirection automatique.

          La personne vient de choisir un mot de passe ; l'envoyer aussitôt vers un écran de
          connexion sans lui laisser voir que l'opération a réussi la ferait douter de ce qu'elle
          vient de faire — et douter d'un mot de passe qu'on n'a pas noté, c'est le recommencer.
        */}
        <Button render={<Link href="/login" />} className="w-full">
          Se connecter
        </Button>
      </div>
    )
  }

  return (
    <form action={envoyer} className="space-y-5">
      <input type="hidden" name="jeton" value={jeton} />

      {/*
        L'adresse est affichée, et en lecture seule.

        Elle dit à quel compte ce lien donne accès — utile quand on en gère plusieurs, ou quand le
        message a été transféré. Elle n'est pas saisissable : c'est le JETON qui désigne le compte,
        pas ce champ, et le rendre modifiable laisserait croire qu'on peut en changer.
      */}
      <div>
        <Label htmlFor="email">Votre identifiant</Label>
        <Input id="email" type="email" value={email} readOnly disabled className="mt-1" />
      </div>

      <div>
        <Label htmlFor="motDePasse">Choisissez un mot de passe</Label>
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
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
        <Label htmlFor="confirmation">Confirmez-le</Label>
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
          <p className="mt-1 text-caption text-destructive">Les deux saisies diffèrent.</p>
        )}
      </div>


      <Button type="submit" disabled={enCours || tropCourt || tropLong || divergent} className="w-full">
        {enCours ? 'Enregistrement…' : 'Enregistrer et continuer'}
      </Button>
    </form>
  )
}
