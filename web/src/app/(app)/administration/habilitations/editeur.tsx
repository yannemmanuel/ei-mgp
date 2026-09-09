'use client'

import { useActionState, useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EtiquetteStatut } from '@/components/ui/etiquette-statut'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  actionChangerActivationRole,
  actionCreerRole,
  actionModifierHabilitations,
  actionModifierIdentiteRole,
  actionSupprimerRole,
  type EtatHabilitation,
} from './actions'

export type PermissionVue = {
  nom: string
  libelle: string
  explication: string
  sensibilite: 'ordinaire' | 'donnees_personnelles' | 'gouvernance'
  /** Aucun code ne consulte ce droit : l'accorder ou le retirer ne change rien. */
  sansEffet?: boolean
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
  /** Rôle du CDC, nommé par le code : modifiable et désactivable, jamais supprimable. */
  livre: boolean
  /** Comptes rattachés, actifs ou non — ce qui empêche une suppression. */
  rattachements: number
  /** Parcours ouverts. Vide = ce rôle ne donne accès à aucun dossier. */
  parcours: string[]
}

const ETAT: EtatHabilitation = {}

const MENTION_SENSIBILITE: Record<PermissionVue['sensibilite'], string | null> = {
  ordinaire: null,
  donnees_personnelles: 'Donne accès à des données personnelles',
  gouvernance: 'Modifie ce que les autres peuvent faire',
}

type Onglet = 'droits' | 'nom' | 'activation'

/**
 * Édition des rôles : leur nom lisible, leurs habilitations, leur activation.
 *
 * Trois formulaires distincts par rôle, et non un seul. Ce n'est pas un détail de mise en page :
 * le journal d'audit doit pouvoir dire quel changement a été voulu. Renommer un rôle et lui
 * retirer un droit dans la même soumission produirait une seule ligne où l'on ne saurait plus
 * lequel des deux gestes était l'intention et lequel a suivi par inadvertance.
 *
 * ⚠️ Les trois formulaires restent MONTÉS quand on passe de l'un à l'autre — masqués par
 * `hidden`, jamais démontés. Les démonter viderait les cases cochées de l'onglet des droits dès
 * qu'on va vérifier le nom du rôle, sans rien dire. Le formulaire public de déclaration a déjà
 * perdu des saisies exactement de cette façon.
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
  const [creation, setCreation] = useState(false)

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
        <Button
          size="sm"
          variant={creation ? 'outline' : 'default'}
          className="ms-auto"
          onClick={() => setCreation((v) => !v)}
        >
          {creation ? 'Annuler' : 'Nouveau rôle'}
        </Button>
      </div>

      {creation && <FormulaireCreation onFerme={() => setCreation(false)} />}

      {filtres.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun rôle ne correspond.</p>
      )}

      {/*
        Deux colonnes : quinze rôles empilés faisaient une page entière à parcourir avant d'en
        atteindre un. La fiche ouverte reprend toute la largeur — on lit une liste à deux
        colonnes, on édite sur une pleine largeur.
      */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {filtres.map((role) => (
          <FicheRole key={role.role} role={role} domaines={domaines} />
        ))}
      </div>
    </div>
  )
}

/**
 * Création d'un rôle.
 *
 * ⚠️ L'avertissement sur les parcours n'est pas décoratif. Les permissions cochées plus tard
 * s'appliqueront bel et bien, mais le cloisonnement par parcours est décrit par le code et ne
 * nomme que les rôles livrés : un rôle créé ici ne donne accès à AUCUN dossier. Le dire avant la
 * création évite de découvrir après coup un rôle qui semble tout permettre et ne montre rien.
 */
function FormulaireCreation({ onFerme }: { onFerme: () => void }) {
  const [etat, envoyer, enCours] = useActionState(actionCreerRole, ETAT)

  return (
    <Card>
      <CardContent className="p-4">
        <form action={envoyer} className="space-y-3">
          <p className="text-sm font-medium text-secondary-900">Nouveau rôle</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="nouveau-libelle" className="text-caption text-muted-foreground">
                Nom affiché
              </Label>
              <Input
                id="nouveau-libelle"
                name="libelle"
                required
                minLength={3}
                maxLength={255}
                placeholder="Gestionnaire des supports"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="nouveau-description" className="text-caption text-muted-foreground">
                Description (facultative)
              </Label>
              <Input
                id="nouveau-description"
                name="description"
                maxLength={1000}
                placeholder="À quoi sert ce rôle, pour qui"
                className="mt-1"
              />
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-caption">
              Un rôle créé ici sert à répartir des tâches d’administration — QR codes, gabarits,
              journal. Il ne donne accès à <strong>aucun dossier</strong> : les dossiers sont
              répartis par type de déclaration, et cette répartition est fixée dans l’application.
            </AlertDescription>
          </Alert>

          <Retour etat={etat} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Création…' : 'Créer le rôle'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onFerme}>
              Annuler
            </Button>
            <span className="text-caption text-muted-foreground">
              Ses droits se cochent ensuite, en l’ouvrant dans la liste.
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FicheRole({ role, domaines }: { role: RoleVue; domaines: DomaineVue[] }) {
  const [ouvert, setOuvert] = useState(false)
  const [onglet, setOnglet] = useState<Onglet>('droits')

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
    <Card
      className={`${role.actif ? '' : 'border-dashed bg-muted/30'} ${ouvert ? 'lg:col-span-2' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-h3 ${role.actif ? 'text-secondary-900' : 'text-secondary-500'}`}>
                {role.libelle}
              </p>
              {!role.actif && <EtiquetteStatut ton="alerte">Désactivé</EtiquetteStatut>}
              {!role.livre && <EtiquetteStatut ton="attention">Créé ici</EtiquetteStatut>}
            </div>
            {role.description && (
              <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-secondary-600">
                {role.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={role.comptes === 0 ? 'secondary' : 'default'}>
              {role.comptes === 0
                ? 'Personne'
                : `${role.comptes} personne${role.comptes > 1 ? 's' : ''}`}
            </Badge>
            {/* Le détail de l'ajustement tenait sur une ligne de plus, sur chacune des quinze
                fiches. Il rejoint l'infobulle de l'étiquette qui l'annonce déjà. */}
            {modifie && (
              <Badge
                variant="destructive"
                title={[
                  role.ajoutees.length > 0 ? `${role.ajoutees.length} droit(s) ajouté(s)` : null,
                  role.retirees.length > 0 ? `${role.retirees.length} droit(s) retiré(s)` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              >
                Ajusté
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}>
              {ouvert ? 'Replier' : 'Modifier'}
            </Button>
          </div>
        </div>

        {!ouvert && (
          <div className="mt-3 space-y-1">
            {!role.actif ? (
              <p className="text-sm text-secondary-600">
                Ce rôle ne donne plus aucun droit.
                {role.comptes > 0 && (
                  <>
                    {' '}
                    {role.comptes} compte{role.comptes > 1 ? 's le portent' : ' le porte'} encore.
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

            {/* Un rôle sans parcours ne verra jamais un dossier, quoi qu'on lui coche. Le taire
                laisserait chercher longtemps pourquoi la liste reste vide. */}
            {role.actif && role.parcours.length === 0 && resume.length > 0 && (
              <p className="text-caption text-muted-foreground">
                N’ouvre aucun dossier — ce rôle sert aux tâches d’administration.
              </p>
            )}
          </div>
        )}

        {ouvert && (
          <div className="mt-4 border-t border-border pt-4">
            <Onglets
              actif={onglet}
              onChange={setOnglet}
              role={role.role}
              onglets={[
                { cle: 'droits', libelle: `Droits (${role.permissions.length})` },
                { cle: 'nom', libelle: 'Nom' },
                { cle: 'activation', libelle: role.actif ? 'Désactiver' : 'Réactiver' },
              ]}
            />

            <div className="mt-4">
              <div
                role="tabpanel"
                aria-labelledby={`onglet-${role.role}-droits`}
                hidden={onglet !== 'droits'}
              >
                <FormulairePermissions
                  role={role}
                  domaines={domaines}
                  onAnnuler={() => setOuvert(false)}
                />
              </div>
              <div
                role="tabpanel"
                aria-labelledby={`onglet-${role.role}-nom`}
                hidden={onglet !== 'nom'}
              >
                <FormulaireIdentite role={role} />
              </div>
              <div
                role="tabpanel"
                aria-labelledby={`onglet-${role.role}-activation`}
                hidden={onglet !== 'activation'}
                className="space-y-4"
              >
                <FormulaireActivation role={role} />
                {!role.livre && <FormulaireSuppression role={role} />}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Bascule entre les trois formulaires d'un rôle.
 *
 * Ils faisaient trois fois la hauteur de l'écran, empilés, alors qu'on n'en remplit qu'un à la
 * fois. Un seul est visible ; les autres restent montés derrière `hidden`.
 *
 * `role="tablist"` promet une navigation aux flèches, et un lecteur d'écran l'annonce comme telle :
 * elle est donc implémentée, avec le tabindex mobile qui va avec. Porter le rôle sans le
 * comportement laisserait l'utilisateur appuyer sur une flèche pour rien.
 */
function Onglets({
  actif,
  onChange,
  onglets,
  role,
}: {
  actif: Onglet
  onChange: (onglet: Onglet) => void
  onglets: { cle: Onglet; libelle: string }[]
  role: string
}) {
  function surTouche(evenement: KeyboardEvent<HTMLDivElement>) {
    const index = onglets.findIndex((o) => o.cle === actif)
    const deplacements: Record<string, number> = {
      ArrowRight: (index + 1) % onglets.length,
      ArrowLeft: (index - 1 + onglets.length) % onglets.length,
      Home: 0,
      End: onglets.length - 1,
    }

    const suivant = deplacements[evenement.key]
    if (suivant === undefined) return

    evenement.preventDefault()
    onChange(onglets[suivant].cle)
    document.getElementById(`onglet-${role}-${onglets[suivant].cle}`)?.focus()
  }

  return (
    <div
      role="tablist"
      onKeyDown={surTouche}
      className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {onglets.map((onglet) => (
        <button
          key={onglet.cle}
          type="button"
          role="tab"
          id={`onglet-${role}-${onglet.cle}`}
          aria-selected={actif === onglet.cle}
          tabIndex={actif === onglet.cle ? 0 : -1}
          onClick={() => onChange(onglet.cle)}
          className={`rounded-md px-3 py-1.5 text-caption font-medium transition-colors ${
            actif === onglet.cle
              ? 'bg-background text-secondary-900 shadow-sm'
              : 'text-muted-foreground hover:text-secondary-800'
          }`}
        >
          {onglet.libelle}
        </button>
      ))}
    </div>
  )
}

/** Nom lisible et description. L'identifiant technique est affiché, jamais éditable. */
function FormulaireIdentite({ role }: { role: RoleVue }) {
  const [etat, envoyer, enCours] = useActionState(actionModifierIdentiteRole, ETAT)

  return (
    <form action={envoyer} className="space-y-3">
      <input type="hidden" name="role" value={role.role} />

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
        Nom interne : <code className="font-mono">{role.role}</code>. Il n’est pas modifiable.
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

  /*
    Ne sont dépliés d'emblée que les domaines où le rôle a déjà quelque chose.

    Les huit domaines ouverts déroulaient trente-six droits d'affilée : il fallait parcourir tout
    le paramétrage métier pour atteindre l'administration technique. Ouvrir ce que le rôle touche
    déjà montre en une hauteur d'écran ce qu'il fait ; le reste est à un clic, et le compte
    « (0/6) » dit ce qu'on trouvera derrière.
  */
  const [deplies, setDeplies] = useState<string[]>(() =>
    domaines
      .filter((d) => d.permissions.some((p) => role.permissions.includes(p.nom)))
      .map((d) => d.cle)
  )

  function basculerDomaine(domaine: DomaineVue, tout: boolean) {
    const noms = domaine.permissions.map((p) => p.nom)

    setCochees((actuelles) =>
      tout ? [...new Set([...actuelles, ...noms])] : actuelles.filter((p) => !noms.includes(p))
    )
  }

  const toutDeplie = deplies.length === domaines.length

  return (
    <form action={envoyer} className="space-y-4">
      <input type="hidden" name="role" value={role.role} />
      {cochees.map((permission) => (
        <input key={permission} type="hidden" name="permissions" value={permission} />
      ))}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-caption text-muted-foreground">
          {cochees.length} droit{cochees.length > 1 ? 's' : ''} accordé
          {cochees.length > 1 ? 's' : ''}
          {!role.actif && ' — enregistrés, mais sans effet tant que le rôle est désactivé'}
        </p>
        <button
          type="button"
          onClick={() => setDeplies(toutDeplie ? [] : domaines.map((d) => d.cle))}
          className="text-caption text-primary-700 underline underline-offset-2"
        >
          {toutDeplie ? 'Tout replier' : 'Tout déplier'}
        </button>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {domaines.map((domaine) => {
          const total = domaine.permissions.length
          const actives = domaine.permissions.filter((p) => cochees.includes(p.nom)).length
          const deplie = deplies.includes(domaine.cle)

          return (
            <fieldset key={domaine.cle}>
              <legend className="sr-only">{domaine.titre}</legend>

              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={deplie}
                  onClick={() =>
                    setDeplies((actuels) =>
                      deplie ? actuels.filter((c) => c !== domaine.cle) : [...actuels, domaine.cle]
                    )
                  }
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      deplie ? '' : '-rotate-90'
                    }`}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-secondary-900">{domaine.titre}</span>
                  <span
                    className={`text-caption ${
                      actives > 0 ? 'text-primary-700' : 'text-muted-foreground'
                    }`}
                  >
                    {actives}/{total}
                  </span>
                </button>

                {deplie && (
                  <button
                    type="button"
                    onClick={() => basculerDomaine(domaine, actives < total)}
                    className="text-caption text-primary-700 underline underline-offset-2"
                  >
                    {actives < total ? 'Tout accorder' : 'Tout retirer'}
                  </button>
                )}
              </div>

              {deplie && (
                <div className="px-3 pb-3">
                  <p className="text-caption text-muted-foreground">{domaine.description}</p>

                  {/* Deux colonnes dès que la largeur le permet : neuf droits de suite pour le
                      seul domaine « Dossiers » faisaient déjà défiler l'écran. */}
                  <div className="mt-2 grid gap-2 xl:grid-cols-2">
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
                </div>
              )}
            </fieldset>
          )
        })}
      </div>

      <Retour etat={etat} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer les droits'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onAnnuler}>
          Annuler
        </Button>
        {role.actif && (
          <span className="text-caption text-muted-foreground">
            S’applique tout de suite aux {role.comptes} personne(s) concernée(s).
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
    <form action={envoyer} className="space-y-3">
      <input type="hidden" name="role" value={role.role} />
      <input type="hidden" name="actif" value={role.actif ? '0' : '1'} />

      <p className="text-caption text-muted-foreground">
        {role.actif ? (
          <>
            Un rôle désactivé ne donne plus aucun droit. Rien n’est perdu : le réactiver rend
            leurs droits aux personnes concernées.
          </>
        ) : (
          <>
            Réactiver ce rôle rend ses droits aux {role.comptes} personne(s) qui le portent
            encore.
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

/**
 * Suppression définitive — réservée aux rôles créés depuis cette interface.
 *
 * Les rôles livrés sont nommés par le code : le cloisonnement par parcours, la table des acteurs
 * d'étape et l'habilitation par site s'y réfèrent. Pour eux, la désactivation est la bonne
 * opération, et elle est juste au-dessus.
 *
 * Le service refuse en outre un rôle encore rattaché à un compte : le supprimer retirerait un
 * accès sans que rien ne le dise, et l'association partirait avec lui. Le bouton n'est donc même
 * pas proposé dans ce cas — l'écran dit quoi faire d'abord.
 */
function FormulaireSuppression({ role }: { role: RoleVue }) {
  const [etat, envoyer, enCours] = useActionState(actionSupprimerRole, ETAT)
  const [confirme, setConfirme] = useState(false)

  return (
    <form action={envoyer} className="space-y-3 border-t border-border pt-4">
      <input type="hidden" name="role" value={role.role} />

      <p className="text-sm font-medium text-secondary-900">Supprimer ce rôle</p>

      {role.rattachements > 0 ? (
        <p className="text-caption text-muted-foreground">
          {role.rattachements} compte(s) portent encore ce rôle. Retirez-le-leur depuis les
          comptes, puis revenez ici.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          Personne ne le porte : la suppression ne retirera d’accès à personne. Le journal en
          gardera la trace.
        </p>
      )}

      <Retour etat={etat} />

      {role.rattachements === 0 &&
        (confirme ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-secondary-900">
              « {role.libelle} » sera supprimé définitivement. Cette action ne s’annule pas.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="destructive" disabled={enCours}>
                {enCours ? 'Suppression…' : 'Confirmer la suppression'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirme(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirme(true)}>
            Supprimer…
          </Button>
        ))}
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
      className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2 transition-colors ${
        coche ? 'border-primary-600/40 bg-primary-50/40' : 'border-border hover:bg-muted/40'
      }`}
    >
      <input
        type="checkbox"
        checked={coche}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-secondary-900">{permission.libelle}</span>
        <span className="block text-caption text-secondary-600">{permission.explication}</span>
        {mention && (
          <span className="mt-1 inline-block text-caption font-medium text-destructive">
            {mention}
          </span>
        )}
        {permission.sansEffet && (
          <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-caption text-secondary-600">
            Sans effet pour l’instant
          </span>
        )}
      </span>
    </label>
  )
}
