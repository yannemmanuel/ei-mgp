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
  /** Codes des parcours confiés à ce compte — ce que le formulaire rouvre coché. */
  parcoursAttribues: string[]
  /**
   * Ce que ce compte voit VRAIMENT, en clair : l'attribution croisée avec ce que ses rôles
   * ouvrent. Peut être vide alors que des parcours lui sont attribués, si aucun de ses rôles ne
   * les ouvre — c'est justement le cas qu'il faut voir.
   */
  parcours: string[]
  tousLesParcours: boolean
  /** Les parcours que ses rôles permettent de lui confier : le formulaire n'offre que ceux-là. */
  parcoursPossibles: { code: string; libelle: string }[]
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
export type RoleOption = {
  nom: string
  libelle: string
  actif: boolean
  /**
   * Les parcours que ce rôle permet de confier.
   *
   * Porté par le rôle plutôt que par le compte parce que le formulaire en a besoin AVANT
   * l'enregistrement : cocher « Correspondant MGP » doit faire apparaître sur-le-champ les trois
   * types de grief qu'on peut alors lui confier. Un calcul côté serveur ne connaîtrait que les
   * rôles déjà enregistrés, et l'administrateur devrait enregistrer deux fois.
   */
  parcours: string[]
}

/** Un type de déclaration proposé à l'attribution. */
export type ParcoursOption = { code: string; libelle: string }

const ETAT: EtatCompte = {}
const champ = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

export function PanneauComptes({
  comptes,
  roles,
  parcours,
  directions,
  sites,
  recherche,
}: {
  comptes: CompteVue[]
  roles: RoleOption[]
  parcours: ParcoursOption[]
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
        lede="Un compte ne se supprime pas : il se désactive, et l’accès est coupé aussitôt."
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
        /*
         * `key` : le formulaire est REMONTÉ dès qu'il change de compte.
         *
         * Ses champs sont non contrôlés — ils reçoivent `defaultValue`, que React ne lit qu'au
         * montage. Sans cette clé, cliquer « Modifier » sur une seconde ligne alors que le
         * formulaire est déjà ouvert le laissait en place : l'identifiant caché, lui contrôlé,
         * suivait la sélection, tandis que le nom et l'adresse restaient ceux du compte
         * précédent. Enregistrer écrivait alors les valeurs d'un compte SUR un autre. Base UI
         * signalait le symptôme en console ; le défaut, lui, était silencieux et destructeur.
         *
         * Remonter réinitialise aussi l'état de la Server Action — le mot de passe initial
         * affiché ne peut plus survivre à un changement de compte.
         */
        <FormulaireCompte
          key={edition?.id ?? 'creation'}
          compte={edition}
          roles={roles}
          parcours={parcours}
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

                        {/*
                          CE QUE LA PERSONNE VOIT, et non plus seulement les rôles qu'elle porte.

                          Deux comptes peuvent détenir « consulter les dossiers », porter le MÊME
                          rôle, et ne pas voir les mêmes déclarations : le parcours se confie
                          personne par personne. C'est la demande métier — chaque type de grief a
                          son référent — et cette ligne est le seul endroit qui la rend lisible.

                          « À habiliter » n'est pas une erreur mais une ÉTAPE MANQUANTE : le compte
                          a un rôle qui pourrait ouvrir des dossiers, on ne lui en a confié aucun,
                          il ne voit donc rien. Sans ce signal, la personne se plaindrait d'un
                          écran vide et l'administrateur chercherait un bug.
                        */}
                        {compte.parcours.length === 0 && compte.parcoursPossibles.length > 0 ? (
                          <Badge
                            variant="destructive"
                            className="mt-1 font-normal"
                            title="Ce compte porte un rôle qui ouvre des dossiers, mais aucun type de déclaration ne lui a été confié : il ne voit rien. Modifiez-le pour lui en attribuer."
                          >
                            À habiliter
                          </Badge>
                        ) : (
                          <p className="mt-1 text-caption text-muted-foreground">
                            {compte.parcours.length === 0
                              ? 'Aucun dossier'
                              : compte.tousLesParcours
                                ? 'Tous les types de déclaration'
                                : compte.parcours.join(' · ')}
                          </p>
                        )}
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
  parcours,
  directions,
  sites,
  comptes,
  onFermer,
}: {
  compte: CompteVue | null
  roles: RoleOption[]
  parcours: ParcoursOption[]
  directions: Option[]
  sites: Option[]
  comptes: CompteVue[]
  onFermer: () => void
}) {
  const [etat, envoyer, enCours] = useActionState(actionEnregistrerCompte, ETAT)

  // Un compte ne peut pas être son propre responsable hiérarchique.
  const responsables = comptes.filter((c) => c.id !== compte?.id)

  /*
    Les rôles cochés, suivis en état — le seul champ du formulaire qui le soit.

    Tous les autres sont non contrôlés (`defaultValue`), et c'est très bien : personne n'a besoin
    de savoir ce qu'on tape dans « Nom » avant l'envoi. Les rôles, si — ils commandent la liste des
    parcours attribuables juste en dessous. Cocher « Correspondant MGP » doit faire apparaître les
    trois types de grief tout de suite, sans passer par un enregistrement intermédiaire.
  */
  const [rolesCoches, setRolesCoches] = useState<Set<string>>(new Set(compte?.roles ?? []))

  const parcoursParRole = new Map(roles.map((r) => [r.nom, r.parcours]))
  const attribuables = new Set<string>()
  for (const role of rolesCoches) {
    for (const code of parcoursParRole.get(role) ?? []) attribuables.add(code)
  }

  const proposes = parcours.filter((p) => attribuables.has(p.code))

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
                      onChange={(e) =>
                        setRolesCoches((avant) => {
                          const apres = new Set(avant)
                          if (e.target.checked) apres.add(role.nom)
                          else apres.delete(role.nom)
                          return apres
                        })
                      }
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

          {/*
            LE SECOND VERROU, et celui qui manquait.

            Le rôle dit ce que la personne sait faire ; ces cases disent SUR QUOI. Trois
            correspondants MGP portent le même rôle et suivent chacun un type de grief : c'est
            exactement ce que cette section permet, et rien d'autre ne le permettait.

            Ce qui est proposé dépend des rôles cochés au-dessus, et se limite à ce qu'ils
            ouvrent : proposer un parcours que le rôle n'ouvre pas laisserait cocher une case sans
            effet. Les rôles transverses — Service MGP, Direction générale, Auditeur, DPO — ne sont
            pas concernés : ils voient tout par construction, et la section le dit plutôt que de
            faire croire à un choix.
          */}
          <fieldset>
            <legend className="text-caption text-muted-foreground">
              Types de déclaration confiés
            </legend>

            {proposes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {rolesCoches.size === 0
                  ? 'Cochez d’abord un rôle : les types de déclaration qu’il permet de confier apparaîtront ici.'
                  : 'Aucun des rôles cochés n’ouvre de dossier. Rien à confier.'}
              </p>
            ) : (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {proposes.map((p) => (
                    <label key={p.code} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="parcours"
                        value={p.code}
                        defaultChecked={compte?.parcoursAttribues.includes(p.code) ?? false}
                        className="mt-1"
                      />
                      <span className="min-w-0 text-secondary-900">{p.libelle}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-caption text-muted-foreground">
                  Sans aucune case cochée, ce compte ne verra aucun dossier.
                </p>
              </>
            )}
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
