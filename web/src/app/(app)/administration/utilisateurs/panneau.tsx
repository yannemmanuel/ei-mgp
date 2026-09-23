'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BoutonSupprimer } from '../bouton-supprimer'
import { actionSupprimerCompte } from '../suppressions-actions'
import {
  actionEnregistrerCompte,
  actionRegenererMotDePasse,
  type EtatCompte,
} from './actions'
import { useRetourEnToast } from '@/lib/retour-operation'

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
  /**
   * Ce que ce compte voit, en clair — les types de déclaration ouverts par ses RÔLES.
   *
   * ⚠️ NE SE MODIFIE PLUS ICI depuis le 2026-09-20 : l'habilitation se coche sur le rôle, dans
   * `/administration/habilitations`. Cette colonne reste en lecture, parce que c'est en regardant
   * un compte qu'on se demande ce qu'il voit — mais le geste, lui, a changé de place.
   */
  parcours: string[]
  tousLesParcours: boolean
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

                          C'est la question qu'on se pose devant un compte, et la réponse ne se lit
                          pas dans la liste des rôles : elle dépend de ce qui a été coché sur
                          chacun d'eux. Cette ligne est le seul endroit qui la rend lisible sans
                          ouvrir l'écran des habilitations.

                          « Ne voit aucun dossier » n'est pas toujours une erreur — c'est l'état
                          normal d'un compte d'administration ou de saisie relais. Mais sur un
                          compte censé traiter des déclarations, c'est la cause qu'on cherchera en
                          s'étonnant d'un écran vide, et elle se règle sur le rôle.
                        */}
                        <p className="mt-1 text-caption text-muted-foreground">
                          {compte.parcours.length === 0
                            ? 'Ne voit aucun dossier'
                            : compte.tousLesParcours
                              ? 'Tous les types de déclaration'
                              : compte.parcours.join(' · ')}
                        </p>
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
                        <div className="flex items-start justify-end gap-2">
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

                          {/*
                            ⚠️ Refusé dès que le compte a laissé une trace — une connexion suffit,
                            elle est journalisée. Le cas visé est le compte créé par erreur : une
                            adresse mal saisie, un doublon, un essai.

                            Pour tous les autres, la désactivation coupe l'accès immédiatement tout
                            en gardant le compte nommé dans l'audit. Sur un dispositif de
                            signalement, pouvoir dire qui a traité quel dossier n'est pas une
                            commodité : c'est ce qui le rend vérifiable.
                          */}
                          <BoutonSupprimer
                            id={compte.id}
                            nom={compte.name}
                            action={actionSupprimerCompte}
                          />
                        </div>
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
  useRetourEnToast(etat)

  /*
    Rattachement contrôlé : direction OU site, l'un excluant l'autre à l'écran.

    ⚠️ Un compte existant peut porter LES DEUX — la règle est nouvelle, la donnée ne l'est pas.
    La DIRECTION l'emporte alors à l'ouverture : c'est le rattachement le plus précis, et il
    porte déjà son site. Le site est donc vidé à l'affichage, et l'enregistrement le confirmera
    — rien n'est écrasé tant qu'on n'enregistre pas.
  */
  const [directionId, setDirectionId] = useState(compte?.directionId ?? '')
  const [siteId, setSiteId] = useState(
    compte?.directionId ? '' : (compte?.siteId ?? '')
  )

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
        {/*
          Ce que l'administrateur doit savoir après une création, selon la voie empruntée.

          PAR LIEN : il n'y a aucun secret à lui montrer, et c'est l'intérêt du procédé — il ne
          peut pas divulguer ce qu'il ne connaît pas. Reste à lui dire que le message est parti,
          et quoi faire s'il ne l'est pas.

          PAR MOT DE PASSE : la valeur est la seule porte du compte, elle ne s'affiche qu'une
          fois, et l'écran doit dire clairement qu'aucun courriel n'est parti.
        */}
        {etat.parInvitation && (
          <Alert className="mb-4" variant={etat.courriel === 'echec' ? 'destructive' : undefined}>
            <AlertDescription>
              {etat.courriel === 'expedie' ? (
                <>
                  <p className="font-medium">Un lien de première connexion a été envoyé.</p>
                  <p className="mt-1 text-caption">
                    La personne choisira son mot de passe. Le lien vaut 72 heures, une seule fois.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">L’envoi du lien a échoué.</p>
                  <p className="mt-1 text-caption">
                    Le compte est créé et le mot de passe ci-dessous lui a été attribué : transmettez-le par un canal sûr. Diagnostic : <code>npm run tester-email</code>.
                  </p>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {etat.motDePasseInitial && (
          <Alert className="mb-4">
            <AlertDescription>
              <p className="font-medium">Mot de passe initial : </p>
              <p className="mt-1 font-mono text-base">{etat.motDePasseInitial}</p>

              {/*
                Le motif est dit UNE fois, et au bon endroit.

                Sur échec d'envoi, la bannière au-dessus l'explique déjà : répéter ici « aucun
                e-mail n'a été envoyé » ferait lire deux diagnostics différents pour un seul
                incident. Le message ci-dessous ne vaut donc que pour l'absence de messagerie.
              */}
              {etat.courriel === 'echec' ? (
                <p className="mt-2 text-caption">
                  À remettre en main propre. La personne le changera à sa première connexion.
                </p>
              ) : (
                <p className="mt-2 text-caption text-amber-700">
                  <span className="font-medium">Aucun e-mail n’a été envoyé.</span> La messagerie n’est pas configurée (<code>MAIL_HOST</code>, <code>MAIL_FROM</code>).
                  Transmettez ce mot de passe par un canal sûr.
                </p>
              )}
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

            {/*
              RATTACHEMENT : une direction OU un site, jamais les deux.

              C'est lui qui décide ce que le compte reçoit — les affectations suivent désormais le
              parcours et le rattachement, sans geste manuel. Deux valeurs concurrentes rendraient
              cette règle indécidable : à quel périmètre appartient quelqu'un rattaché à la
              direction A et au site B, quand A ne relève pas de B ?

              ⚠️ La direction est le rattachement le PLUS PRÉCIS : elle porte déjà son site
              (`directions.site_id`), et `chargerUtilisateurAutorise()` l'en déduit. Choisir une
              direction ne perd donc aucun cloisonnement — il le resserre.
            */}
            <div>
              <Label htmlFor="directionId" className="text-caption text-muted-foreground">
                Direction
              </Label>
              <select
                id="directionId"
                name="directionId"
                value={directionId}
                onChange={(e) => {
                  setDirectionId(e.target.value)
                  if (e.target.value !== '') setSiteId('')
                }}
                disabled={siteId !== ''}
                className={`${champ} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">—</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.libelle}
                  </option>
                ))}
              </select>
              {siteId !== '' && (
                <p className="mt-1 text-caption text-muted-foreground">
                  Un site est déjà choisi. Videz-le pour rattacher à une direction.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="siteId" className="text-caption text-muted-foreground">
                Site
              </Label>
              <select
                id="siteId"
                name="siteId"
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value)
                  if (e.target.value !== '') setDirectionId('')
                }}
                disabled={directionId !== ''}
                className={`${champ} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">—</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.libelle}
                  </option>
                ))}
              </select>
              {directionId !== '' && (
                <p className="mt-1 text-caption text-muted-foreground">
                  Déduit de la direction choisie — inutile de le renseigner.
                </p>
              )}
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
            ⚠️ LES CASES « TYPES DE DÉCLARATION CONFIÉS » ONT ÉTÉ RETIRÉES D'ICI.

            L'habilitation se coche désormais sur le RÔLE, dans l'écran des habilitations
            (décision métier du 2026-09-20) : tous les porteurs d'un rôle voient les mêmes types.
            Laisser les cases en place aurait fait croire à un réglage par personne qui n'a plus
            aucun effet — le pire des deux, une commande qui ne commande rien.

            Ce qui reste ici est la CONSÉQUENCE, en lecture : ce que ce compte verra, d'après les
            rôles cochés juste au-dessus. On la lit au moment où l'on coche, sans avoir à ouvrir
            un second écran pour deviner le résultat.
          */}
          <fieldset>
            <legend className="text-caption text-muted-foreground">
              Ce que ce compte verra
            </legend>

            {proposes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {rolesCoches.size === 0
                  ? 'Cochez un rôle : les types de déclaration qu’il ouvre apparaîtront ici.'
                  : 'Aucun des rôles cochés n’ouvre de type de déclaration. Ce compte ne verra aucun dossier.'}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {proposes.map((p) => (
                  <Badge key={p.code} variant="secondary" className="font-normal">
                    {p.libelle}
                  </Badge>
                ))}
              </div>
            )}

            <p className="mt-2 text-caption text-muted-foreground">
              Pour changer les types qu’un rôle ouvre, allez dans les{' '}
              <Link
                href="/administration/habilitations"
                className="text-primary-700 underline underline-offset-2"
              >
                habilitations
              </Link>
              . Le changement vaut pour tous les porteurs de ce rôle.
            </p>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="actif" value="1" defaultChecked={compte?.actif ?? true} />
            Compte actif
          </label>


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
  useRetourEnToast(etat)

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


      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? 'Attribution…' : 'Réattribuer un mot de passe'}
      </Button>
    </form>
  )
}
