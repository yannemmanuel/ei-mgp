'use client'

import { useActionState, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { actionModifierHabilitations, type EtatHabilitation } from './actions'

export type PermissionVue = {
  nom: string
  libelle: string
  explication: string
  sensibilite: 'ordinaire' | 'donnees_personnelles' | 'gouvernance'
}

export type DomaineVue = {
  cle: string
  titre: string
  description: string
  permissions: PermissionVue[]
}

export type RoleVue = {
  role: string
  libelle: string
  permissions: string[]
  comptes: number
  retirees: string[]
  ajoutees: string[]
}

const ETAT: EtatHabilitation = {}

const MENTION_SENSIBILITE: Record<PermissionVue['sensibilite'], string | null> = {
  ordinaire: null,
  donnees_personnelles: 'Donne accès à des données personnelles',
  gouvernance: 'Modifie ce que les autres peuvent faire',
}

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
  domaines: DomaineVue[]
}) {
  const [recherche, setRecherche] = useState('')

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (terme === '') return roles

    return roles.filter(
      (r) => r.role.toLowerCase().includes(terme) || r.libelle.toLowerCase().includes(terme)
    )
  }, [roles, recherche])

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Filtrer les rôles…"
        aria-label="Filtrer les rôles"
        className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {filtres.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun rôle ne correspond.</p>
      )}

      {filtres.map((role) => (
        <FicheRole key={role.role} role={role} domaines={domaines} />
      ))}
    </div>
  )
}

function FicheRole({ role, domaines }: { role: RoleVue; domaines: DomaineVue[] }) {
  const [etat, envoyer, enCours] = useActionState(actionModifierHabilitations, ETAT)
  const [ouvert, setOuvert] = useState(false)
  const [cochees, setCochees] = useState<string[]>(role.permissions)

  const detenues = new Set(role.permissions)
  const modifie = role.retirees.length > 0 || role.ajoutees.length > 0

  // Résumé : quels domaines ce rôle touche, et combien de droits dans chacun. Vingt étiquettes
  // techniques les unes à côté des autres n'apprennent rien ; « Dossiers (5) » se lit d'un coup.
  const resume = domaines
    .map((d) => ({
      titre: d.titre,
      nombre: d.permissions.filter((p) => detenues.has(p.nom)).length,
    }))
    .filter((d) => d.nombre > 0)

  const sensibles = domaines
    .flatMap((d) => d.permissions)
    .filter((p) => detenues.has(p.nom) && p.sensibilite !== 'ordinaire')

  function basculerDomaine(domaine: DomaineVue, tout: boolean) {
    const noms = domaine.permissions.map((p) => p.nom)

    setCochees((actuelles) =>
      tout
        ? [...new Set([...actuelles, ...noms])]
        : actuelles.filter((p) => !noms.includes(p))
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-h3 text-secondary-900">{role.libelle}</p>
            <p className="mt-0.5 font-mono text-caption text-muted-foreground">{role.role}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={role.comptes === 0 ? 'secondary' : 'default'}>
              {role.comptes === 0
                ? 'Personne'
                : `${role.comptes} personne${role.comptes > 1 ? 's' : ''}`}
            </Badge>
            {modifie && <Badge variant="destructive">Ajusté</Badge>}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCochees(role.permissions)
                setOuvert((v) => !v)
              }}
            >
              {ouvert ? 'Replier' : 'Modifier'}
            </Button>
          </div>
        </div>

        {!ouvert && (
          <div className="mt-3 space-y-2">
            {resume.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ce rôle ne permet rien pour l’instant.</p>
            ) : (
              <p className="text-sm text-secondary-700">
                {resume.map((d, index) => (
                  <span key={d.titre}>
                    {index > 0 && ' · '}
                    {d.titre} <span className="text-muted-foreground">({d.nombre})</span>
                  </span>
                ))}
              </p>
            )}

            {sensibles.length > 0 && (
              <p className="text-caption text-destructive">
                Dont : {sensibles.map((p) => p.libelle.toLowerCase()).join(', ')}.
              </p>
            )}
          </div>
        )}

        {modifie && !ouvert && (
          <p className="mt-2 text-caption text-muted-foreground">
            Diffère de la configuration livrée
            {role.ajoutees.length > 0 && <> — {role.ajoutees.length} ajoutée(s)</>}
            {role.retirees.length > 0 && <> — {role.retirees.length} retirée(s)</>}
          </p>
        )}

        {ouvert && (
          <form action={envoyer} className="mt-4 space-y-6 border-t border-border pt-4">
            <input type="hidden" name="role" value={role.role} />
            {cochees.map((permission) => (
              <input key={permission} type="hidden" name="permissions" value={permission} />
            ))}

            {domaines.map((domaine) => {
              const total = domaine.permissions.length
              const actives = domaine.permissions.filter((p) => cochees.includes(p.nom)).length

              return (
                <fieldset key={domaine.cle}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <legend className="text-sm font-medium text-secondary-900">
                      {domaine.titre}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({actives}/{total})
                      </span>
                    </legend>
                    <button
                      type="button"
                      onClick={() => basculerDomaine(domaine, actives < total)}
                      className="text-caption text-primary-700 underline underline-offset-2"
                    >
                      {actives < total ? 'Tout accorder' : 'Tout retirer'}
                    </button>
                  </div>

                  <p className="mt-0.5 text-caption text-muted-foreground">{domaine.description}</p>

                  <div className="mt-3 space-y-2">
                    {domaine.permissions.map((permission) => (
                      <Droit
                        key={permission.nom}
                        permission={permission}
                        coche={cochees.includes(permission.nom)}
                        onChange={(actif) =>
                          setCochees((actuelles) =>
                            actif
                              ? [...actuelles, permission.nom]
                              : actuelles.filter((p) => p !== permission.nom)
                          )
                        }
                      />
                    ))}
                  </div>
                </fieldset>
              )
            })}

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

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="submit" size="sm" disabled={enCours}>
                {enCours ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <span className="text-caption text-muted-foreground">
                Prend effet immédiatement pour les {role.comptes} personne(s) portant ce rôle.
              </span>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function Droit({
  permission,
  coche,
  onChange,
}: {
  permission: PermissionVue
  coche: boolean
  onChange: (actif: boolean) => void
}) {
  const mention = MENTION_SENSIBILITE[permission.sensibilite]

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
        coche ? 'border-primary-600/40 bg-primary-50/40' : 'border-border hover:bg-muted/40'
      }`}
    >
      <input
        type="checkbox"
        checked={coche}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-secondary-900">{permission.libelle}</span>
        <span className="block text-caption text-secondary-600">{permission.explication}</span>
        {mention && (
          <span className="mt-1 inline-block text-caption font-medium text-destructive">
            {mention}
          </span>
        )}
        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
          {permission.nom}
        </span>
      </span>
    </label>
  )
}
