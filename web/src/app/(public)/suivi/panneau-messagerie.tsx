'use client'

import { useActionState, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  chargerConversationDeclarant,
  envoyerMessageDeclarant,
  type EtatConversation,
  type MessageVue,
} from './messagerie-actions'

/**
 * Messagerie du déclarant (EX-NOT-07).
 *
 * Ce composant ne connaît pas l'identifiant du dossier — volontairement. Il appelle des actions
 * serveur qui relisent elles-mêmes la session de suivi signée : rien de ce qui transite par le
 * navigateur ne désigne un dossier.
 */
const ETAT: EtatConversation = {}

const heureFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export function PanneauMessagerie() {
  const [etat, envoyer, enCours] = useActionState(envoyerMessageDeclarant, ETAT)
  const [initial, setInitial] = useState<EtatConversation | null>(null)

  // Chargement initial : la conversation dépend d'un cookie, donc d'une requête — elle ne peut
  // pas être rendue avec le résultat de la recherche, qui est déjà affiché.
  useEffect(() => {
    let vivant = true

    chargerConversationDeclarant().then((resultat) => {
      if (vivant) setInitial(resultat)
    })

    return () => {
      vivant = false
    }
  }, [])

  // Après un envoi, l'état de l'action fait autorité ; avant, c'est le chargement initial.
  const courant = etat.messages || etat.erreur ? etat : (initial ?? {})
  const messages = courant.messages ?? []

  return (
    <div className="mt-6 rounded-lg border border-border p-6">
      <h2 className="text-h3 text-secondary-900">Messagerie sécurisée</h2>
      <p className="mt-1 text-caption text-muted-foreground">
        Échangez avec le service en charge de votre dossier. Votre anonymat est préservé.
      </p>

      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
        {initial === null && !etat.messages && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}

        {(initial !== null || etat.messages) && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun message pour ce dossier.</p>
        )}

        {messages.map((m) => (
          <Bulle key={m.id} message={m} />
        ))}
      </div>

      {courant.erreur && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{courant.erreur}</AlertDescription>
        </Alert>
      )}

      <form action={envoyer} className="mt-4 space-y-2 border-t border-border pt-4">
        <label htmlFor="corps" className="sr-only">
          Votre message
        </label>
        <textarea
          id="corps"
          name="corps"
          rows={3}
          required
          minLength={2}
          maxLength={2000}
          placeholder="Écrire un message…"
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={enCours}>
          {enCours ? 'Envoi…' : 'Envoyer'}
        </Button>
      </form>
    </div>
  )
}

function Bulle({ message }: { message: MessageVue }) {
  const estAgent = message.cote === 'agent'

  return (
    <div className={`flex ${estAgent ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          estAgent ? 'bg-muted text-secondary-800' : 'bg-secondary-900 text-white'
        }`}
      >
        <p className="whitespace-pre-line">{message.corps}</p>
        <p className={`mt-1 text-caption ${estAgent ? 'text-muted-foreground' : 'text-white/70'}`}>
          {message.auteur} — {heureFr(message.envoyeLe)}
        </p>
      </div>
    </div>
  )
}
