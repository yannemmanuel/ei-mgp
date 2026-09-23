'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EtatAction } from './actions'
import { actionEnvoyerMessageAgent } from './messagerie-actions'
import { useRetourEnToast } from '@/lib/retour-operation'

export type MessageVue = {
  id: string
  cote: 'agent' | 'declarant'
  auteur: string
  corps: string
  envoyeLe: string
}

type Props = {
  dossierId: string
  messages: MessageVue[]
  peutEnvoyer: boolean
}

const ETAT: EtatAction = {}

const heureFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export function PanneauMessagerie({ dossierId, messages, peutEnvoyer }: Props) {
  const [etat, envoyer, enCours] = useActionState(actionEnvoyerMessageAgent, ETAT)
  useRetourEnToast(etat)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Messagerie sécurisée</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun message pour ce dossier.</p>
          )}

          {messages.map((m) => (
            <Bulle key={m.id} message={m} />
          ))}
        </div>

        {peutEnvoyer && (
          <form action={envoyer} className="mt-4 space-y-2 border-t border-border pt-4">
            <input type="hidden" name="dossierId" value={dossierId} />

            <label htmlFor="corps" className="sr-only">
              Message au déclarant
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


            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Envoi…' : 'Envoyer'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function Bulle({ message }: { message: MessageVue }) {
  const estAgent = message.cote === 'agent'

  // Côté interne, c'est l'AGENT qui est « à droite » : la conversation est lue depuis son poste.
  return (
    <div className={`flex ${estAgent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          estAgent ? 'bg-secondary-900 text-white' : 'bg-muted text-secondary-800'
        }`}
      >
        <p className="whitespace-pre-line">{message.corps}</p>
        <p className={`mt-1 text-caption ${estAgent ? 'text-white/70' : 'text-muted-foreground'}`}>
          {message.auteur} — {heureFr(message.envoyeLe)}
        </p>
      </div>
    </div>
  )
}
