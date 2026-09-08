'use client'

import { useActionState, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EtiquetteStatut } from '@/components/ui/etiquette-statut'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  actionChangerActivationRole,
  actionModifierHabilitations,
  actionModifierIdentiteRole,
  type EtatHabilitation,
} from './actions'

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
  description: string | null
  actif: boolean
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
 * Édition des rôles : leur nom lisible, leurs habilitations, leur activation.
 *
 * Trois formulaires distincts par rôle, et non un seul. Ce n'est pas un détail de mise en page :
 * le journal d'audit doit pouvoir dire quel changement a été voulu. Renommer un rôle et lui
 * retirer un droit dans la même soumission produirait une seule ligne où l'on ne saurait plus
 * lequel des deux gestes était l'intention et lequel a suivi par inadvertance.
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

  const inactifs = roles.filter((r) => !r.actif).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Filtrer les rôles…"
          aria-label="Filtrer les rôles"
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {inactifs > 0 && (
          <p className="text-caption text-muted-foreground">
            {inactifs} rôle{inactifs > 1 ? 's' : ''} désactivé{inactifs > 1 ? 's' : ''}.
          </p>
        )}
      </div>

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
  const [ouvert, setOuvert] = useState(false)

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

  return (
    <Card className={role.actif ? undefined : 'border-dashed bg-muted/30'}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-h3 ${role.actif ? 'text-secondary-900' : 'text-secondary-500'}`}>
                {role.libelle}
              </p>
              {!role.actif && <EtiquetteStatut ton="alerte">Désactivé</EtiquetteStatut>}
            </div>
            <p className="mt-0.5 font-mono text-caption text-muted-foreground">{role.role}</p>
            {role.description && (
              <p className="mt-1 max-w-2xl text-sm text-secondary-600">{role.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={role.comptes === 0 ? 'secondary' : 'default'}>
              {role.comptes === 0
                ? 'Personne'
                : `${role.comptes} personne${role.comptes > 1 ? 's' : ''}`}
            </Badge>
            {modifie && <Badge variant="destructive">Ajusté</Badge>}
            <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}>
              {ouvert ? 'Replier' : 'Modifier'}
            </Button>
          </div>
        </div>

        {!ouvert && (
          <div className="mt-3 space-y-2">
            {!role.actif ? (
              <p className="text-sm text-secondary-600">
                Ce rôle ne confère plus aucun droit.
                {role.comptes > 0 && (
                  <>
                    {' '}
                    {role.comptes} compte{role.comptes > 1 ? 's le portent' : ' le porte'} encore et{' '}
                    {role.comptes > 1 ? 'retrouveront' : 'retrouvera'} ses droits à la réactivation.
                  </>
                )}
              </p>
            ) : resume.length === 0 ? (
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

            {role.actif && sensibles.length > 0 && (
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
          <div className="mt-4 space-y-6 border-t border-border pt-4">
            <FormulaireIdentite role={role} />
            <FormulairePermissions role={role} domaines={domaines} onAnnuler={() => setOuvert(false)} />
            <FormulaireActivation role={role} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Nom lisible et description. L'identifiant technique est affiché, jamais éditable. */
function FormulaireIdentite({ role }: { role: RoleVue }) {
  const [etat, envoyer, enCours] = useActionState(actionModifierIdentiteRole, ETAT)

  return (
    <form action={envoyer} className="space-y-3">
      <input type="hidden" name="role" value={role.role} />

      <p className="text-sm font-medium text-secondary-900">Identité</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`libelle-${role.role}`} className="text-caption text-muted-foreground">
            Nom affiché
          </Label>
          <Input
            id={`libelle-${role.role}`}
            name="libelle"
            defaultValue={role.libelle}
            maxLength={255}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label
            htmlFor={`description-${role.role}`}
            className="text-caption text-muted-foreground"
          >
            Description (facultative)
          </Label>
          <Input
            id={`description-${role.role}`}
            name="description"
            defaultValue={role.description ?? ''}
            maxLength={1000}
            placeholder="À quoi sert ce rôle, pour qui"
            className="mt-1"
          />
        </div>
      </div>

      <p className="text-caption text-muted-foreground">
        L’identifiant technique <code className="font-mono">{role.role}</code> n’est pas
        modifiable : le cloisonnement par parcours s’y réfère, et le renommer retirerait
        silencieusement leur périmètre aux comptes concernés.
      </p>

      <Retour etat={etat} />

      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le nom'}
      </Button>
    </form>
  )
}

function FormulairePermissions({
  role,
  domaines,
  onAnnuler,
}: {
  role: RoleVue
  domaines: DomaineVue[]
  onAnnuler: () => void
}) {
  const [etat, envoyer, enCours] = useActionState(actionModifierHabilitations, ETAT)
  const [cochees, setCochees] = useState<string[]>(role.permissions)

  function basculerDomaine(domaine: DomaineVue, tout: boolean) {
    const noms = domaine.permissions.map((p) => p.nom)

    setCochees((actuelles) =>
      tout ? [...new Set([...actuelles, ...noms])] : actuelles.filter((p) => !noms.includes(p))
    )
  }

  return (
    <form action={envoyer} className="space-y-6 border-t border-border pt-4">
      <input type="hidden" name="role" value={role.role} />
      {cochees.map((permission) => (
        <input key={permission} type="hidden" name="permissions" value={permission} />
      ))}

      <div>
        <p className="text-sm font-medium text-secondary-900">Habilitations</p>
        {!role.actif && (
          <p className="mt-1 text-caption text-muted-foreground">
            Ce rôle est désactivé : ces droits sont enregistrés mais ne s’appliquent pas tant qu’il
            ne l’est pas de nouveau.
          </p>
        )}
      </div>

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

      <Retour etat={etat} />

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer les habilitations'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onAnnuler}>
          Annuler
        </Button>
        {role.actif && (
          <span className="text-caption text-muted-foreground">
            Prend effet immédiatement pour les {role.comptes} personne(s) portant ce rôle.
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * Activation.
 *
 * La désactivation retire ses droits à tout le monde d'un coup : elle demande une confirmation,
 * qui énonce combien de personnes sont concernées. Un bouton unique rendrait le geste trop léger
 * pour ce qu'il fait.
 */
function FormulaireActivation({ role }: { role: RoleVue }) {
  const [etat, envoyer, enCours] = useActionState(actionChangerActivationRole, ETAT)
  const [confirme, setConfirme] = useState(false)

  return (
    <form action={envoyer} className="space-y-3 border-t border-border pt-4">
      <input type="hidden" name="role" value={role.role} />
      <input type="hidden" name="actif" value={role.actif ? '0' : '1'} />

      <p className="text-sm font-medium text-secondary-900">
        {role.actif ? 'Désactiver ce rôle' : 'Réactiver ce rôle'}
      </p>

      <p className="text-caption text-muted-foreground">
        {role.actif ? (
          <>
            Un rôle désactivé cesse de conférer ses permissions et son périmètre de parcours, dès
            la requête suivante. Les rattachements sont conservés : réactiver le rôle rend leurs
            droits aux comptes concernés, sans avoir à les réattribuer.
          </>
        ) : (
          <>
            La réactivation rétablit les droits enregistrés ci-dessus pour les{' '}
            {role.comptes} personne(s) qui portent encore ce rôle.
          </>
        )}
      </p>

      <Retour etat={etat} />

      {role.actif && !confirme ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirme(true)}>
          Désactiver…
        </Button>
      ) : role.actif ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-secondary-900">
            {role.comptes === 0 ? (
              <>Aucun compte actif ne porte ce rôle : personne ne perdra d’accès.</>
            ) : (
              <>
                <strong>
                  {role.comptes} personne{role.comptes > 1 ? 's' : ''}
                </strong>{' '}
                perdr{role.comptes > 1 ? 'ont' : 'a'} immédiatement les droits de ce rôle.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={enCours}>
              {enCours ? 'Désactivation…' : 'Confirmer la désactivation'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirme(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'Réactivation…' : 'Réactiver'}
        </Button>
      )}
    </form>
  )
}

function Retour({ etat }: { etat: EtatHabilitation }) {
  if (etat.erreur) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{etat.erreur}</AlertDescription>
      </Alert>
    )
  }

  if (etat.succes) {
    return (
      <Alert role="status">
        <AlertDescription>{etat.succes}</AlertDescription>
      </Alert>
    )
  }

  return null
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
