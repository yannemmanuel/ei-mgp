'use client'

import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { actionModifierHabilitations, type EtatHabilitation } from './actions'

export type RoleVue = {
  role: string
  permissions: string[]
  reference: string[]
  comptes: number
  retirees: string[]
  ajoutees: string[]
}

const ETAT: EtatHabilitation = {}

/**
 * Édition des habilitations, rôle par rôle.
 *
 * Un formulaire distinct par rôle : soumettre l'ensemble en un seul geste rendrait impossible de
 * dire, dans le journal d'audit, quel changement a été voulu et lequel a suivi par inadvertance.
 */
export function EditeurHabilitations({
  roles,
  domaines,
}: {
  roles: RoleVue[]
  domaines: [string, string[]][]
}) {
  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <FicheRole key={role.role} role={role} domaines={domaines} />
      ))}
    </div>
  )
}

function FicheRole({ role, domaines }: { role: RoleVue; domaines: [string, string[]][] }) {
  const [etat, envoyer, enCours] = useActionState(actionModifierHabilitations, ETAT)
  const [ouvert, setOuvert] = useState(false)

  const modifie = role.retirees.length > 0 || role.ajoutees.length > 0

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-secondary-900">{role.role}</p>
            <p className="mt-1 text-caption text-muted-foreground">
              {role.permissions.length} permission(s) · {role.comptes} compte(s) actif(s)
              {modifie && ' · écart avec la configuration livrée'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {role.comptes === 0 && (
              <Badge variant="secondary">Aucun porteur</Badge>
            )}
            {modifie && <Badge variant="destructive">Ajusté</Badge>}
            <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}>
              {ouvert ? 'Replier' : 'Modifier'}
            </Button>
          </div>
        </div>

        {!ouvert && role.permissions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {role.permissions.map((permission) => (
              <Badge key={permission} variant="secondary" className="font-normal">
                {permission}
              </Badge>
            ))}
          </div>
        )}

        {modifie && (
          <p className="mt-3 text-caption text-muted-foreground">
            {role.ajoutees.length > 0 && <>Ajoutées : {role.ajoutees.join(', ')}. </>}
            {role.retirees.length > 0 && <>Retirées : {role.retirees.join(', ')}.</>}
          </p>
        )}

        {ouvert && (
          <form action={envoyer} className="mt-4 space-y-4 border-t border-border pt-4">
            <input type="hidden" name="role" value={role.role} />

            {domaines.map(([domaine, liste]) => (
              <fieldset key={domaine}>
                <legend className="text-label uppercase tracking-wide text-secondary-500">
                  {domaine}
                </legend>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {liste.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-start gap-2 font-mono text-caption text-secondary-700"
                    >
                      <input
                        type="checkbox"
                        name="permissions"
                        value={permission}
                        defaultChecked={role.permissions.includes(permission)}
                        className="mt-0.5"
                      />
                      {permission}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {etat.erreur && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{etat.erreur}</AlertDescription>
              </Alert>
            )}
            {etat.succes && (
              <Alert role="status">
                <AlertDescription>{etat.succes}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={enCours}>
                {enCours ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <span className="text-caption text-muted-foreground">
                Effet immédiat pour tous les comptes portant ce rôle.
              </span>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
