'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  actionEnregistrerCompte,
  actionRegenererMotDePasse,
  type EtatCompte,
} from './actions'

export type CompteVue = {
  id: string
  name: string
  email: string
  matricule: string
  poste: string
  actif: boolean
  directionId: string
  siteId: string
  responsableId: string
  roles: string[]
  /** Rattachement lisible, `null` s'il n'est pas renseigné. */
  site: string | null
  direction: string | null
  /**
   * Ce compte porte un rôle cloisonné par site sans en avoir un.
   *
   * Il voit alors TOUS les dossiers de son parcours, ce que le cloisonnement existe précisément
   * pour empêcher. Le signaler ici vaut mieux que de le découvrir en s'étonnant du nombre de
   * dossiers affichés.
   */
  siteManquant: boolean
  /** Site du compte et site de sa direction se contredisent : l'un des deux est faux. */
  rattachementIncoherent: boolean
}

type Option = { id: string; libelle: string }

/** Un rôle proposé à l'attribution : son identifiant technique, son nom lisible, son activation. */
export type RoleOption = { nom: string; libelle: string; actif: boolean }

const ETAT: EtatCompte = {}
const champ = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

export function PanneauComptes({
  comptes,
  roles,
  directions,
  sites,
  recherche,
}: {
  comptes: CompteVue[]
  roles: RoleOption[]
  directions: Option[]
  sites: Option[]
  recherche: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  // Les comptes portent des identifiants techniques ; le tableau affiche des noms.
  const libelleDuRole = new Map(roles.map((r) => [r.nom, r.libelle]))
  const [edition, setEdition] = useState<CompteVue | null>(null)
  const [creation, setCreation] = useState(false)

  function chercher(valeur: string) {
    const suivants = new URLSearchParams(params.toString())

    if (valeur === '') suivants.delete('q')
    else suivants.set('q', valeur)

    router.push(`/administration/utilisateurs?${suivants.toString()}`)
  }

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Comptes"
        lede="Un compte n’est jamais supprimé : il reste cité dans l’historique et le journal d’audit. La désactivation coupe l’accès dès la requête suivante."
        mailles={[{ libelle: 'Administration', href: '/administration' }, { libelle: 'Comptes' }]}
        actions={
          !creation && edition === null ? (
            <Button size="sm" onClick={() => setCreation(true)}>
              Créer un compte
            </Button>
          ) : null
        }
      />

      {(creation || edition !== null) && (
        <FormulaireCompte
          compte={edition}
          roles={roles}
          directions={directions}
          sites={sites}
          comptes={comptes}
          onFermer={() => {
            setCreation(false)
            setEdition(null)
          }}
        />
      )}

      <Card className="p-4">
        <Label htmlFor="q" className="text-caption text-muted-foreground">
          Rechercher
        </Label>
        <Input
          id="q"
          defaultValue={recherche}
          placeholder="Nom ou adresse e-mail"
          className="mt-1 max-w-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') chercher((e.target as HTMLInputElement).value.trim())
          }}
        />
      </Card>

      <Card>
        <CardContent className="p-0">
          {comptes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Aucun compte ne correspond.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">Nom</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">E-mail</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Rôles</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Rattachement</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">État</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {comptes.map((compte) => (
                    <tr key={compte.id} className="border-b border-border/50">
                      <td className="px-4 py-2 text-secondary-900">{compte.name}</td>
                      <td className="px-4 py-2 text-secondary-800">{compte.email}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {compte.roles.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            compte.roles.map((role) => (
                              <Badge key={role} variant="secondary" className="font-normal">
                                {libelleDuRole.get(role) ?? role}
                              </Badge>
                            ))
                          )}
                          {compte.siteManquant && (
                            <Badge
                              variant="destructive"
                              className="font-normal"
                              title="Ce rôle est habilité par site, mais aucun site n’est renseigné : le compte voit tous les dossiers de son parcours."
                            >
                              Site manquant
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {compte.site === null && compte.direction === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="text-sm">
                            <span className="text-secondary-900">{compte.site ?? 'Aucun site'}</span>
                            {compte.direction && (
                              <span className="block text-caption text-muted-foreground">
                                {compte.direction}
                              </span>
                            )}
                            {compte.rattachementIncoherent && (
                              <span
                                className="mt-0.5 block text-caption font-medium text-destructive"
                                title="La direction de ce compte relève d’un autre site que celui qui lui est attribué."
                              >
                                Site et direction se contredisent
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={compte.actif ? 'default' : 'secondary'}>
                          {compte.actif ? 'Actif' : 'Désactivé'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCreation(false)
                            setEdition(compte)
                          }}
                        >
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FormulaireCompte({
  compte,
  roles,
  directions,
  sites,
  comptes,
  onFermer,
}: {
  compte: CompteVue | null
  roles: RoleOption[]
  directions: Option[]
  sites: Option[]
  comptes: CompteVue[]
  onFermer: () => void
}) {
  const [etat, envoyer, enCours] = useActionState(actionEnregistrerCompte, ETAT)

  // Un compte ne peut pas être son propre responsable hiérarchique.
  const responsables = comptes.filter((c) => c.id !== compte?.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">{compte ? 'Modifier le compte' : 'Créer un compte'}</CardTitle>
      </CardHeader>
      <CardContent>
        {etat.motDePasseInitial && (
          <Alert className="mb-4">
            <AlertDescription>
              <p className="font-medium">Mot de passe initial : </p>
              <p className="mt-1 font-mono text-base">{etat.motDePasseInitial}</p>
              <p className="mt-2 text-caption">
                Il n’est affiché qu’une fois et n’est stocké nulle part en clair. Transmettez-le
                par un canal sûr ; la personne le changera à sa première connexion.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <form action={envoyer} className="space-y-4">
          <input type="hidden" name="id" value={compte?.id ?? ''} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" className="text-caption text-muted-foreground">
                Nom *
              </Label>
              <Input id="name" name="name" required defaultValue={compte?.name ?? ''} className="mt-1" />
            </div>

            <div>
              <Label htmlFor="email" className="text-caption text-muted-foreground">
                Adresse e-mail *
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={compte?.email ?? ''}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="matricule" className="text-caption text-muted-foreground">
                Matricule
              </Label>
              <Input id="matricule" name="matricule" defaultValue={compte?.matricule ?? ''} className="mt-1" />
            </div>

            <div>
              <Label htmlFor="poste" className="text-caption text-muted-foreground">
                Poste
              </Label>
              <Input id="poste" name="poste" defaultValue={compte?.poste ?? ''} className="mt-1" />
            </div>

            <div>
              <Label htmlFor="directionId" className="text-caption text-muted-foreground">
                Direction
              </Label>
              <select id="directionId" name="directionId" defaultValue={compte?.directionId ?? ''} className={champ}>
                <option value="">—</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="siteId" className="text-caption text-muted-foreground">
                Site
              </Label>
              <select id="siteId" name="siteId" defaultValue={compte?.siteId ?? ''} className={champ}>
                <option value="">—</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="responsableHierarchiqueId" className="text-caption text-muted-foreground">
                Responsable hiérarchique
              </Label>
              <select
                id="responsableHierarchiqueId"
                name="responsableHierarchiqueId"
                defaultValue={compte?.responsableId ?? ''}
                className={champ}
              >
                <option value="">—</option>
                {responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-caption text-muted-foreground">
                Destinataire des escalades de retard sur les dossiers de ce compte.
              </p>
            </div>
          </div>

          <fieldset>
            <legend className="text-caption text-muted-foreground">Rôles</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {roles.map((role) => {
                const detenu = compte?.roles.includes(role.nom) ?? false

                // Un rôle désactivé reste affiché s'il est déjà porté : le décocher doit être une
                // décision, pas la conséquence d'un enregistrement où l'on venait corriger un
                // numéro de téléphone.
                if (!role.actif && !detenu) return null

                return (
                  <label key={role.nom} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="roles"
                      value={role.nom}
                      defaultChecked={detenu}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block text-secondary-900">
                        {role.libelle}
                        {!role.actif && (
                          <span className="ml-1.5 text-caption text-destructive">désactivé</span>
                        )}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {role.nom}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="actif" value="1" defaultChecked={compte?.actif ?? true} />
            Compte actif
          </label>

          {etat.erreur && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{etat.erreur}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onFermer}>
              Fermer
            </Button>
          </div>
        </form>

        {compte && <RegenerationMotDePasse compte={compte} />}
      </CardContent>
    </Card>
  )
}

/**
 * Seule voie de récupération opérationnelle aujourd'hui : le parcours « mot de passe oublié » en
 * libre-service n'est pas atteignable dans la baseline, et exigerait de toute façon un transport
 * e-mail qui n'est pas branché.
 */
function RegenerationMotDePasse({ compte }: { compte: CompteVue }) {
  const [etat, envoyer, enCours] = useActionState(actionRegenererMotDePasse, ETAT)

  return (
    <form action={envoyer} className="mt-6 space-y-2 border-t border-border pt-4">
      <input type="hidden" name="id" value={compte.id} />

      <p className="text-caption text-muted-foreground">
        Si {compte.name} a perdu son mot de passe, attribuez-lui-en un nouveau. Il ne s’affichera
        qu’une fois — transmettez-le par un canal sûr.
      </p>

      {etat.motDePasseInitial && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">Nouveau mot de passe : </p>
            <p className="mt-1 font-mono text-base">{etat.motDePasseInitial}</p>
          </AlertDescription>
        </Alert>
      )}

      {etat.erreur && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{etat.erreur}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? 'Attribution…' : 'Réattribuer un mot de passe'}
      </Button>
    </form>
  )
}
