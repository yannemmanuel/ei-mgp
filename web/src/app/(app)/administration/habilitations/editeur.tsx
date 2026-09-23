'use client'

import { useActionState, useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useRetourEnToast } from '@/lib/retour-operation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EtiquetteStatut } from '@/components/ui/etiquette-statut'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  actionChangerActivationRole,
  actionChangerComportementsRole,
  actionCreerRole,
  actionModifierEtapesRole,
  actionModifierHabilitations,
  actionModifierIdentiteRole,
  actionModifierParcoursRole,
  actionSupprimerRole,
  type EtatHabilitation,
} from './actions'

/** Un type de déclaration, tel qu'on le coche. */
export type ParcoursVue = { code: string; libelle: string }

/** Un type OUVERT par le rôle, avec son alerte de circuit accéléré. */
export type ParcoursDuRoleVue = ParcoursVue & { alerteCircuitCritique: boolean }

/** Une étape de départ, colonne de la grille « qui fait avancer quoi ». */
export type EtapeVue = { code: string; libelle: string }

/**
 * Un comportement du rôle — ce qui ne se dit ni par une permission, ni par un type, ni par une
 * étape. Le libellé et l'aide viennent du serveur : l'écran ne les reformule pas.
 */
export type ComportementVue = { cle: string; libelle: string; aide: string }

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
  /** Rôle du CDC, nommé par le code. Supprimable comme les autres, si personne ne le porte. */
  livre: boolean
  /** Comptes rattachés, actifs ou non — ce qui empêche une suppression. */
  rattachements: number
  /** Types de déclaration ouverts. Vide = ce rôle ne donne accès à aucun dossier. */
  parcours: ParcoursDuRoleVue[]
  /** Le rôle les ouvre tous. Évite d'énumérer quatre libellés pour rien. */
  tousLesParcours: boolean
  /** Les quatre comportements, cochés ou non — indexés par la clé du catalogue serveur. */
  comportements: Record<string, boolean>
  /** Les cases cochées de la grille « qui fait avancer quoi ». */
  etapes: { parcours: string; statut: string }[]
}

const ETAT: EtatHabilitation = {}

/**
 * La valeur ORDINAIRE de chaque comportement — celle qui ne mérite pas d'être signalée.
 *
 * ⚠️ « Voit l'identité du déclarant » est vrai par défaut : c'est un RETRAIT qui se coche. Le
 * résumé ne montre donc que les écarts, sans quoi il répéterait sur chacun des vingt rôles une
 * ligne qui ne distingue rien.
 */
const VALEUR_PAR_DEFAUT: Record<string, boolean> = {
  traite_dossiers: false,
  cloisonne_par_rattachement: false,
  voit_seulement_ses_declarations: false,
  voit_identite_declarant: true,
}

/**
 * Nature d'un droit, en deux mots et sans couleur d'alerte.
 *
 * C'étaient deux phrases en rouge sous chaque droit concerné : le rouge annonce un danger ou une
 * erreur, or il s'agit d'une information de nature. Il criait, et il occupait une ligne de plus
 * sur chacun des droits sensibles.
 */
const MENTION_SENSIBILITE: Record<PermissionVue['sensibilite'], string | null> = {
  ordinaire: null,
  donnees_personnelles: 'Données personnelles',
  gouvernance: 'Droits des autres',
}

type Onglet = 'droits' | 'declarations' | 'etapes' | 'comportements' | 'nom' | 'activation'

/** La clé d'une case de la grille, dans la forme que la Server Action attend. */
function cleEtape(parcours: string, statut: string): string {
  return `${parcours}/${statut}`
}

/**
 * Édition des rôles : leur nom lisible, leurs habilitations, leur activation.
 *
 * Un formulaire par geste, pour que le journal d'audit puisse dire lequel a été voulu : renommer
 * un rôle et lui retirer un droit d'un seul envoi produirait une ligne indéchiffrable.
 *
 * ⚠️ Les formulaires restent MONTÉS d'un onglet à l'autre, masqués par `hidden` : les démonter
 * viderait les cases cochées dès qu'on va vérifier le nom du rôle, sans rien dire.
 */
export function EditeurHabilitations({
  roles,
  domaines,
  parcoursDisponibles,
  etapesDisponibles,
  comportementsDisponibles,
}: {
  roles: RoleVue[]
  domaines: DomaineVue[]
  /** Les types de déclaration proposés à la coche. */
  parcoursDisponibles: ParcoursVue[]
  /** Les lignes de la grille des étapes : celles d'où un dossier peut partir. */
  etapesDisponibles: EtapeVue[]
  /** Les quatre comportements, décrits par le serveur. */
  comportementsDisponibles: ComportementVue[]
}) {
  const [recherche, setRecherche] = useState('')
  const [creation, setCreation] = useState(false)

  /**
   * Ordre ALPHABÉTIQUE, sur le libellé lisible.
   *
   * L'ordre venait de la base, c'est-à-dire de nulle part : chercher « Comité éthique » parmi
   * vingt rôles revenait à tous les parcourir. `localeCompare` en français range les accents où
   * on les attend — « Équipe » après « Employé », là où un tri brut le renverrait en fin de liste.
   */
  const tries = useMemo(
    () => [...roles].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
    [roles]
  )

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (terme === '') return tries

    return tries.filter(
      (r) => r.role.toLowerCase().includes(terme) || r.libelle.toLowerCase().includes(terme)
    )
  }, [tries, recherche])

  /**
   * Le rôle en cours d'édition, désigné par son slug.
   *
   * ⚠️ Le SLUG et non l'objet : la page se revalide à chaque enregistrement et rend des objets
   * neufs. Garder l'ancien afficherait indéfiniment les valeurs d'avant la sauvegarde.
   */
  const [selection, setSelection] = useState<string | null>(null)
  const choisi = filtres.find((r) => r.role === selection) ?? null

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

      {/*
        Maître à gauche, détail à droite.

        Les fiches dépliantes obligeaient à replier l'une pour en ouvrir une autre, et la liste se
        reconfigurait sous le curseur à chaque fois. Ici elle ne bouge JAMAIS : on passe d'un rôle
        à l'autre sans perdre le repère de celui qu'on vient de quitter.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <ListeRoles roles={filtres} selection={selection} onSelectionner={setSelection} />

        {choisi ? (
          /*
            `key` : le panneau est REMONTÉ quand on change de rôle.

            Ses formulaires sont amorcés par `defaultValue` et `useState`, lus au seul montage.
            Sans cette clé, passer d'un rôle à l'autre laisserait les champs du précédent — et
            enregistrer écrirait les valeurs d'un rôle SUR un autre.
          */
          <PanneauRole
            key={choisi.role}
            role={choisi}
            domaines={domaines}
            parcoursDisponibles={parcoursDisponibles}
            etapesDisponibles={etapesDisponibles}
            comportementsDisponibles={comportementsDisponibles}
          />
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {filtres.length === 0
                ? 'Aucun rôle ne correspond à votre recherche.'
                : 'Choisissez un rôle à gauche pour voir et modifier ses droits.'}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * La liste des rôles, à gauche.
 *
 * Chaque ligne dit l'essentiel sans qu'on ait à l'ouvrir : le nom, combien de personnes le
 * portent, et s'il est désactivé ou ajusté par rapport à sa référence. Le reste est à droite.
 */
function ListeRoles({
  roles,
  selection,
  onSelectionner,
}: {
  roles: RoleVue[]
  selection: string | null
  onSelectionner: (role: string) => void
}) {
  return (
    <Card className="overflow-hidden">
      <ul aria-label="Rôles" className="divide-y divide-border">
        {roles.map((role) => {
          const estChoisi = role.role === selection

          return (
            <li key={role.role}>
              {/* Un vrai bouton : tabulation, entrée et espace fonctionnent sans qu'on ait à les
                  réimplémenter, et `aria-current` annonce lequel est ouvert. */}
              <button
                type="button"
                onClick={() => onSelectionner(role.role)}
                aria-current={estChoisi ? 'true' : undefined}
                className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors ${
                  estChoisi ? 'bg-primary/10' : 'hover:bg-muted/50'
                }`}
              >
                <span className="flex w-full flex-wrap items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium ${
                      role.actif ? 'text-secondary-900' : 'text-secondary-500'
                    }`}
                  >
                    {role.libelle}
                  </span>
                  {!role.actif && <EtiquetteStatut ton="alerte">Désactivé</EtiquetteStatut>}
                </span>

                <span className="text-caption text-muted-foreground">
                  {role.comptes === 0
                    ? 'Personne'
                    : `${role.comptes} personne${role.comptes > 1 ? 's' : ''}`}
                  {' · '}
                  {role.permissions.length} droit{role.permissions.length > 1 ? 's' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/**
 * Le rôle choisi : ce qu'il ouvre, ce qu'il permet, et comment l'éteindre.
 *
 * La désactivation est en évidence plutôt que dans un onglet — c'est le geste qu'on vient faire
 * quand un rôle pose problème. Sa confirmation dit combien de personnes perdent leurs droits.
 */
function PanneauRole({
  role,
  domaines,
  parcoursDisponibles,
  etapesDisponibles,
  comportementsDisponibles,
}: {
  role: RoleVue
  domaines: DomaineVue[]
  parcoursDisponibles: ParcoursVue[]
  etapesDisponibles: EtapeVue[]
  comportementsDisponibles: ComportementVue[]
}) {
  const [onglet, setOnglet] = useState<Onglet>('droits')

  const detenues = new Set(role.permissions)

  // Quels domaines ce rôle touche, et combien de droits dans chacun. Vingt étiquettes techniques
  // côte à côte n'apprennent rien ; « Dossiers (5) » se lit d'un coup.
  const resume = domaines
    .map((d) => ({
      titre: d.titre,
      nombre: d.permissions.filter((p) => detenues.has(p.nom)).length,
    }))
    .filter((d) => d.nombre > 0)

  // Seuls les comportements qui S'ÉCARTENT du défaut : les répéter tous sur chaque rôle ne
  // distinguerait rien.
  const ecartsDeComportement = comportementsDisponibles
    .filter((c) => role.comportements[c.cle] !== VALEUR_PAR_DEFAUT[c.cle])
    .map((c) => (role.comportements[c.cle] ? c.libelle : `Pas de « ${c.libelle.toLowerCase()} »`))

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
            {role.description && (
              <p className="mt-1 max-w-2xl text-sm text-secondary-600">{role.description}</p>
            )}
          </div>

          <Badge variant={role.comptes === 0 ? 'secondary' : 'default'}>
            {role.comptes === 0
              ? 'Personne'
              : `${role.comptes} personne${role.comptes > 1 ? 's' : ''}`}
          </Badge>
        </div>

        {/*
          CE QUE LE RÔLE OUVRE — la moitié invisible des habilitations.

          Un rôle peut détenir « consulter les dossiers » et ne voir qu'un seul type de
          déclaration : la permission est cochée, le cloisonnement par parcours la restreint, et
          rien à l'écran ne le disait.
        */}
        {!role.actif ? (
          <p className="mt-3 text-sm text-secondary-600">
            Ce rôle ne donne plus aucun droit.
            {role.comptes > 0 && (
              <>
                {' '}
                {role.comptes} compte{role.comptes > 1 ? 's le portent' : ' le porte'} encore.
              </>
            )}
          </p>
        ) : (
          /*
            Une liste de DÉFINITIONS, et non quatre paragraphes empilés.

            Chaque ligne répond à une question différente, et le `<dl>` la nomme : un lecteur
            d'écran annonce « Droits : Dossiers (5) » au lieu d'une suite de phrases dont rien ne
            dit ce qu'elles décrivent. À l'œil, les intitulés alignés donnent le même repère.
          */
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-caption text-muted-foreground">Droits</dt>
            <dd className="text-secondary-800">
              {resume.length === 0
                ? 'Aucun pour l’instant'
                : resume.map((d) => `${d.titre} (${d.nombre})`).join(' · ')}
            </dd>

            <dt className="text-caption text-muted-foreground">Déclarations</dt>
            <dd className={role.parcours.length === 0 ? 'text-destructive' : 'text-secondary-800'}>
              {role.parcours.length === 0
                ? 'Aucun type — ses porteurs ne voient aucun dossier'
                : role.tousLesParcours
                  ? 'Tous les types'
                  : role.parcours.map((p) => p.libelle).join(' · ')}
            </dd>

            {/*
              ⚠️ « Aucune étape » est la situation par défaut d'un rôle nouvellement créé, et elle
              est invisible autrement : les droits sont cochés, le type ouvert, et le bouton de
              changement de statut reste absent sans que rien ne l'explique.
            */}
            <dt className="text-caption text-muted-foreground">Étapes</dt>
            <dd className={role.etapes.length === 0 ? 'text-destructive' : 'text-secondary-800'}>
              {role.etapes.length === 0
                ? 'Aucune — ne fait avancer aucun dossier'
                : `${role.etapes.length} cochée${role.etapes.length > 1 ? 's' : ''}`}
            </dd>

            {ecartsDeComportement.length > 0 && (
              <>
                <dt className="text-caption text-muted-foreground">Comportement</dt>
                <dd className="text-secondary-800">{ecartsDeComportement.join(' · ')}</dd>
              </>
            )}
          </dl>
        )}

        {/* Le geste d'extinction, à portée immédiate — il garde sa confirmation. */}
        <div className="mt-4 border-t border-border pt-4">
          <FormulaireActivation role={role} />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <Onglets
            actif={onglet}
            onChange={setOnglet}
            role={role.role}
            onglets={[
              { cle: 'droits', libelle: `Droits (${role.permissions.length})` },
              { cle: 'declarations', libelle: `Déclarations (${role.parcours.length})` },
              { cle: 'etapes' as const, libelle: `Étapes (${role.etapes.length})` },
              { cle: 'comportements' as const, libelle: 'Comportement' },
              { cle: 'nom', libelle: 'Nom' },
              // ⚠️ Offert pour TOUS les rôles : le service ne regarde plus que l'attribution, et
              // l'écran doit suivre — sinon la règle change côté serveur sans être atteignable.
              { cle: 'activation' as const, libelle: 'Supprimer' },
            ]}
          />

          <div className="mt-4">
            <div
              role="tabpanel"
              id={`panneau-${role.role}-droits`}
              aria-labelledby={`onglet-${role.role}-droits`}
              hidden={onglet !== 'droits'}
              tabIndex={0}
            >
              {/*
                `key` : remonté quand les permissions ENREGISTRÉES changent. Les cases sont
                amorcées depuis `role.permissions` par un `useState`, lu au seul montage — un
                enregistrement mené ailleurs, ou qui n'a pas abouti, laisserait sinon l'écran
                montrer autre chose que ce que la base contient. Des cases cochées mais NON
                soumises survivent, elles, à un enregistrement voisin.
              */}
              <FormulairePermissions
                key={role.permissions.join(' ')}
                role={role}
                domaines={domaines}
                onAnnuler={() => setOnglet('droits')}
              />
            </div>

            <div
              role="tabpanel"
              id={`panneau-${role.role}-declarations`}
              aria-labelledby={`onglet-${role.role}-declarations`}
              hidden={onglet !== 'declarations'}
              tabIndex={0}
            >
              {/*
                `key` : même raison que pour les droits — les cases sont amorcées au montage, et
                un enregistrement mené ailleurs laisserait sinon l'écran montrer autre chose que
                ce que la base contient.
              */}
              <FormulaireParcours
                key={role.parcours
                  .map((p) => `${p.code}${p.alerteCircuitCritique ? '!' : ''}`)
                  .join(' ')}
                role={role}
                parcoursDisponibles={parcoursDisponibles}
              />
            </div>

            <div
              role="tabpanel"
              id={`panneau-${role.role}-etapes`}
              aria-labelledby={`onglet-${role.role}-etapes`}
              hidden={onglet !== 'etapes'}
              tabIndex={0}
            >
              {/*
                `key` : même raison que pour les droits — la grille est amorcée au montage, et un
                enregistrement mené ailleurs laisserait sinon voir autre chose que la base.
              */}
              <FormulaireEtapes
                key={role.etapes.map((e) => cleEtape(e.parcours, e.statut)).sort().join(' ')}
                role={role}
                parcoursDisponibles={parcoursDisponibles}
                etapesDisponibles={etapesDisponibles}
              />
            </div>

            <div
              role="tabpanel"
              id={`panneau-${role.role}-comportements`}
              aria-labelledby={`onglet-${role.role}-comportements`}
              hidden={onglet !== 'comportements'}
              tabIndex={0}
            >
              <FormulaireComportements
                key={comportementsDisponibles
                  .map((c) => `${c.cle}=${role.comportements[c.cle] ? '1' : '0'}`)
                  .join(' ')}
                role={role}
                comportementsDisponibles={comportementsDisponibles}
              />
            </div>

            <div
              role="tabpanel"
              id={`panneau-${role.role}-nom`}
              aria-labelledby={`onglet-${role.role}-nom`}
              hidden={onglet !== 'nom'}
              tabIndex={0}
            >
              {/*
                `key` : remonté quand les valeurs ENREGISTRÉES changent. Le serveur élague les
                espaces et ramène une description vide à `null` ; sans remontage, `defaultValue`
                n'est plus relu et le champ cesse de montrer ce qui est enregistré.
              */}
              <FormulaireIdentite key={`${role.libelle}|${role.description ?? ''}`} role={role} />
            </div>

            <div
              role="tabpanel"
              id={`panneau-${role.role}-activation`}
              aria-labelledby={`onglet-${role.role}-activation`}
              hidden={onglet !== 'activation'}
              tabIndex={0}
            >
              <FormulaireSuppression role={role} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Création d'un rôle.
 *
 * ⚠️ L'avertissement n'est pas décoratif : un rôle créé ici peut tout faire, mais ne fait rien
 * TANT QUE rien n'est coché. L'écran doit dire où aller le cocher.
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

          {/*
            ⚠️ CE TEXTE DISAIT L'INVERSE DE LA VÉRITÉ jusqu'au 2026-09-21.

            Il annonçait qu'un rôle créé ici ne donne accès à AUCUN dossier, « cette répartition
            étant fixée dans l'application ». C'était exact tant que les types, les étapes et le
            cloisonnement vivaient dans le code. Ils se cochent désormais — un rôle créé ici peut
            tout faire. Le laisser aurait découragé la création de rôles métier au nom d'une limite
            qui n'existe plus.
          */}
          <Alert>
            <AlertDescription className="text-caption">
              Un rôle créé ici n’ouvre <strong>aucun dossier tant que rien n’est coché</strong> :
              l’onglet « Déclarations » lui donne son périmètre, « Étapes » le droit de faire
              avancer un dossier.
            </AlertDescription>
          </Alert>

          <AnnonceRetour etat={etat} />

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

/**
 * Bascule entre les formulaires d'un rôle : un seul visible, les autres montés derrière `hidden`.
 *
 * `role="tablist"` promet une navigation aux flèches, et un lecteur d'écran l'annonce : elle est
 * donc implémentée, tabindex mobile compris.
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
      aria-label="Réglages du rôle"
      onKeyDown={surTouche}
      className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {onglets.map((onglet) => (
        <button
          key={onglet.cle}
          type="button"
          role="tab"
          id={`onglet-${role}-${onglet.cle}`}
          aria-controls={`panneau-${role}-${onglet.cle}`}
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

      <AnnonceRetour etat={etat} />

      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le nom'}
      </Button>
    </form>
  )
}

/**
 * Sur quels types de déclaration ce rôle est habilité.
 *
 * ⚠️ Effet immédiat pour tous les porteurs du rôle, sans reconnexion. L'écran le dit avant le
 * geste, et rappelle qu'un rôle sans aucun type ne montre aucun dossier — ce qui ressemble à une
 * panne quand on l'a fait sans le savoir.
 */
/**
 * Les quatre comportements du rôle — ni un droit, ni un type, ni une étape.
 *
 * ⚠️ « A la charge » n'est pas « peut faire avancer un dossier », qui est un droit : celui-ci dit
 * qui en RÉPOND. Le Service MGP porte le droit sans la charge, et les confondre le faisait
 * apparaître titulaire de tous les dossiers.
 *
 * Les libellés viennent du serveur, pour que l'écran et le code disent la même chose.
 */
function FormulaireComportements({
  role,
  comportementsDisponibles,
}: {
  role: RoleVue
  comportementsDisponibles: ComportementVue[]
}) {
  const [etat, envoyer, enCours] = useActionState(actionChangerComportementsRole, ETAT)
  const [cochees, setCochees] = useState<string[]>(() =>
    comportementsDisponibles.filter((c) => role.comportements[c.cle]).map((c) => c.cle)
  )

  function basculer(cle: string, actif: boolean) {
    setCochees((actuelles) =>
      actif ? [...new Set([...actuelles, cle])] : actuelles.filter((c) => c !== cle)
    )
  }

  return (
    <form action={envoyer} className="space-y-4">
      <input type="hidden" name="role" value={role.role} />

      <p className="text-sm text-muted-foreground">
        Ce que ce rôle fait de particulier, au-delà de ses droits.
      </p>

      <div className="space-y-2">
        {comportementsDisponibles.map((comportement) => {
          const id = `comportement-${role.role}-${comportement.cle}`
          const actif = cochees.includes(comportement.cle)

          return (
            <label
              key={comportement.cle}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/40"
            >
              <input
                id={id}
                name="comportements"
                type="checkbox"
                value={comportement.cle}
                checked={actif}
                onChange={(evenement) => basculer(comportement.cle, evenement.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary-700"
              />
              <span className="min-w-0 text-sm text-secondary-900">
                {comportement.libelle}
                <span className="mt-1 block text-caption text-muted-foreground">
                  {comportement.aide}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {/*
        ⚠️ L'AVERTISSEMENT LE PLUS UTILE DE CET ÉCRAN.

        Décocher « voit l'identité du déclarant » est le seul de ces réglages dont l'effet ne se
        voit nulle part depuis l'écran d'administration : les fiches continuent de s'afficher,
        simplement amputées du nom. Le dire au moment où on décoche est la seule occasion.
      */}
      {!cochees.includes('voit_identite_declarant') && (
        <Alert role="status">
          <AlertDescription>
            Ses porteurs ne verront jamais qui a déclaré, même sur une déclaration identifiée.
          </AlertDescription>
        </Alert>
      )}

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

      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le comportement'}
      </Button>
    </form>
  )
}

/**
 * La grille « qui fait avancer quoi » : une case par type de déclaration et par étape.
 *
 * ⚠️ Une case vide INTERDIT : il n'y a plus d'étape « ouverte à tous ». C'est le réglage le plus
 * silencieux du dispositif — sans acteur, le bouton reste absent sans qu'aucun message ne
 * l'explique —, d'où sa propre grille plutôt qu'une ligne de plus ailleurs.
 */
function FormulaireEtapes({
  role,
  parcoursDisponibles,
  etapesDisponibles,
}: {
  role: RoleVue
  parcoursDisponibles: ParcoursVue[]
  etapesDisponibles: EtapeVue[]
}) {
  const [etat, envoyer, enCours] = useActionState(actionModifierEtapesRole, ETAT)
  const [cochees, setCochees] = useState<string[]>(() =>
    role.etapes.map((e) => cleEtape(e.parcours, e.statut))
  )

  const ouverts = useMemo(() => new Set(role.parcours.map((p) => p.code)), [role.parcours])

  function basculer(cle: string, actif: boolean) {
    setCochees((actuelles) =>
      actif ? [...new Set([...actuelles, cle])] : actuelles.filter((c) => c !== cle)
    )
  }

  /** Toute une colonne d’un coup : quatorze cases à cocher une à une décourage le paramétrage. */
  function basculerColonne(codeParcours: string, actif: boolean) {
    const cles = etapesDisponibles.map((e) => cleEtape(codeParcours, e.code))

    setCochees((actuelles) =>
      actif
        ? [...new Set([...actuelles, ...cles])]
        : actuelles.filter((c) => !cles.includes(c))
    )
  }

  return (
    <form action={envoyer} className="space-y-4">
      <input type="hidden" name="role" value={role.role} />

      <p className="text-sm text-muted-foreground">
        À quelles étapes ce rôle peut faire avancer un dossier, et sur quels types. Une case
        décochée interdit.
      </p>

      {/*
        La grille déborde à l’étroit : elle défile HORIZONTALEMENT dans son propre cadre, jamais
        en emportant la page. Les libellés d’étape restent lisibles, c’est ce qui permet de savoir
        quelle ligne on coche.
      */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="p-2 text-left font-medium text-secondary-700">
                Étape
              </th>
              {parcoursDisponibles.map((parcours) => (
                <th
                  key={parcours.code}
                  scope="col"
                  className="p-2 text-center align-bottom font-medium text-secondary-700"
                >
                  <span className="block">{parcours.libelle}</span>

                  {/*
                    ⚠️ UN TYPE NON OUVERT : les cases restent cochables, et c’est délibéré.

                    On paramètre souvent la grille AVANT d’ouvrir le type. Les griser obligerait à
                    faire les deux gestes dans un ordre imposé, sans que rien ne le dise. La
                    mention suffit à expliquer pourquoi rien ne se passe.
                  */}
                  {!ouverts.has(parcours.code) && (
                    <span className="mt-0.5 block text-caption font-normal text-muted-foreground">
                      type non ouvert
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      basculerColonne(
                        parcours.code,
                        !etapesDisponibles.every((e) =>
                          cochees.includes(cleEtape(parcours.code, e.code))
                        )
                      )
                    }
                    className="mt-1 text-caption font-normal text-primary-700 underline underline-offset-2"
                  >
                    {etapesDisponibles.every((e) =>
                      cochees.includes(cleEtape(parcours.code, e.code))
                    )
                      ? 'Tout décocher'
                      : 'Tout cocher'}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {etapesDisponibles.map((etape) => (
              <tr key={etape.code} className="border-b border-border last:border-b-0">
                <th
                  scope="row"
                  className="p-2 text-left font-normal text-secondary-900"
                >
                  {etape.libelle}
                </th>

                {parcoursDisponibles.map((parcours) => {
                  const cle = cleEtape(parcours.code, etape.code)
                  const id = `etape-${role.role}-${parcours.code}-${etape.code}`

                  return (
                    <td key={parcours.code} className="p-2 text-center">
                      <input
                        id={id}
                        name="etapes"
                        type="checkbox"
                        value={cle}
                        checked={cochees.includes(cle)}
                        onChange={(evenement) => basculer(cle, evenement.target.checked)}
                        aria-label={`${etape.libelle} — ${parcours.libelle}`}
                        className="h-4 w-4 accent-primary-700"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cochees.length === 0 && (
        <Alert role="status">
          <AlertDescription>
            Aucune étape cochée : ce rôle ne pourra faire avancer aucun dossier, même avec le
            droit de le faire.
          </AlertDescription>
        </Alert>
      )}

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

      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer la grille'}
      </Button>
    </form>
  )
}

function FormulaireParcours({
  role,
  parcoursDisponibles,
}: {
  role: RoleVue
  parcoursDisponibles: ParcoursVue[]
}) {
  const [etat, envoyer, enCours] = useActionState(actionModifierParcoursRole, ETAT)
  const [cochees, setCochees] = useState<string[]>(role.parcours.map((p) => p.code))
  const [alertes, setAlertes] = useState<string[]>(
    role.parcours.filter((p) => p.alerteCircuitCritique).map((p) => p.code)
  )

  function basculer(code: string, actif: boolean) {
    setCochees((actuelles) =>
      actif ? [...new Set([...actuelles, code])] : actuelles.filter((c) => c !== code)
    )

    /*
      ⚠️ DÉCOCHER UN TYPE RETIRE SON ALERTE, et l'écran le montre au lieu de le faire en
      silence côté serveur. Les deux vivent sur la même ligne : le type parti, l'alerte l'est
      aussi. Laisser la case cochée à l'écran aurait laissé croire qu'elle survivait.
    */
    if (!actif) setAlertes((actuelles) => actuelles.filter((c) => c !== code))
  }

  function basculerAlerte(code: string, actif: boolean) {
    setAlertes((actuelles) =>
      actif ? [...new Set([...actuelles, code])] : actuelles.filter((c) => c !== code)
    )
  }

  return (
    <form action={envoyer} className="space-y-4">
      <input type="hidden" name="role" value={role.role} />

      <p className="text-sm text-muted-foreground">
        Les types de déclaration que ce rôle ouvre. Le rattachement restreint ensuite à
        l’intérieur.
      </p>

      <div className="space-y-2">
        {parcoursDisponibles.map((parcours) => {
          const id = `parcours-${role.role}-${parcours.code}`
          const actif = cochees.includes(parcours.code)

          const idAlerte = `circuit-${role.role}-${parcours.code}`

          return (
            <div
              key={parcours.code}
              className="rounded-md border border-border transition-colors hover:bg-muted/40"
            >
              <label htmlFor={id} className="flex cursor-pointer items-start gap-3 p-3">
                <input
                  id={id}
                  name="parcours"
                  type="checkbox"
                  value={parcours.code}
                  checked={actif}
                  onChange={(evenement) => basculer(parcours.code, evenement.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary-700"
                />
                <span className="text-sm text-secondary-900">{parcours.libelle}</span>
              </label>

              {/*
                ⚠️ L'ALERTE DU CIRCUIT ACCÉLÉRÉ SE COCHE PAR TYPE, et n'apparaît que sous un type
                ouvert : elle vit sur la même ligne en base, et n'aurait aucun support sinon.

                Elle était écrite dans le code, type par type. Un rôle créé ici n'y figurait pas,
                n'était donc alerté d'aucune déclaration critique, et ne recevait simplement
                jamais rien — le plus silencieux des oublis, sur le circuit le plus urgent.
              */}
              {actif && (
                <label
                  htmlFor={idAlerte}
                  className="flex cursor-pointer items-start gap-3 border-t border-border px-3 py-2 ps-9"
                >
                  <input
                    id={idAlerte}
                    name="circuitCritique"
                    type="checkbox"
                    value={parcours.code}
                    checked={alertes.includes(parcours.code)}
                    onChange={(evenement) =>
                      basculerAlerte(parcours.code, evenement.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary-700"
                  />
                  <span className="text-caption text-secondary-700">
                    Alerté en circuit accéléré
                    <span className="mt-0.5 block text-muted-foreground">
                      Prévenu immédiatement dès qu’une déclaration de ce type, dans son périmètre,
                      est qualifiée critique.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )
        })}
      </div>

      {cochees.length === 0 && (
        <Alert role="status">
          <AlertDescription>
            Aucun type coché : ce rôle ne verra aucun dossier. Attendu pour un rôle
            d’administration ou de saisie, une panne pour tout autre.
          </AlertDescription>
        </Alert>
      )}

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

      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer les types de déclaration'}
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
    Tout est déplié d'emblée : on vient ici pour accorder un droit que le rôle n'a pas, et replier
    les domaines qu'il ne touche pas cachait précisément celui qu'on cherche. C'est la recherche
    qui réduit la page, pas le repliement — qui reste disponible.
  */
  const [deplies, setDeplies] = useState<string[]>(() => domaines.map((d) => d.cle))
  const [recherche, setRecherche] = useState('')

  const terme = recherche.trim().toLowerCase()

  const visibles = useMemo(() => {
    if (terme === '') return domaines

    return domaines
      .map((domaine) => ({
        ...domaine,
        permissions: domaine.permissions.filter(
          (p) =>
            p.libelle.toLowerCase().includes(terme) || p.explication.toLowerCase().includes(terme)
        ),
      }))
      .filter((domaine) => domaine.permissions.length > 0)
  }, [domaines, terme])

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

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un droit…"
          aria-label="Chercher un droit"
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <p className="text-caption text-muted-foreground">
          {cochees.length} droit{cochees.length > 1 ? 's' : ''} accordé
          {cochees.length > 1 ? 's' : ''}
          {!role.actif && ' — sans effet tant que le rôle est désactivé'}
        </p>
        <button
          type="button"
          onClick={() => setDeplies(toutDeplie ? [] : domaines.map((d) => d.cle))}
          className="ms-auto text-caption text-primary-700 underline underline-offset-2"
        >
          {toutDeplie ? 'Tout replier' : 'Tout déplier'}
        </button>
      </div>

      {terme !== '' && visibles.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun droit ne correspond à « {recherche} ».</p>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {visibles.map((domaine) => {
          // Le compte porte sur le domaine ENTIER, jamais sur le sous-ensemble filtré : « 2/9 »
          // qui deviendrait « 1/1 » pendant une recherche ferait croire à un droit perdu.
          const entier = domaines.find((d) => d.cle === domaine.cle) ?? domaine
          const total = entier.permissions.length
          const actives = entier.permissions.filter((p) => cochees.includes(p.nom)).length
          // Une recherche déplie ce qu'elle trouve : sans cela, les résultats resteraient
          // derrière un chevron fermé et la recherche ne servirait à rien.
          const deplie = terme !== '' || deplies.includes(domaine.cle)

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

                {/* Pendant une recherche, « Tout accorder » ne dirait pas s'il vise les droits
                    affichés ou tout le domaine : on ne le propose pas. */}
                {deplie && terme === '' && (
                  <button
                    type="button"
                    onClick={() => basculerDomaine(entier, actives < total)}
                    className="text-caption text-primary-700 underline underline-offset-2"
                  >
                    {actives < total ? 'Tout accorder' : 'Tout retirer'}
                  </button>
                )}
              </div>

              {deplie && (
                <div className="px-3 pb-3">
                  {terme === '' && (
                    <p className="text-caption text-muted-foreground">{domaine.description}</p>
                  )}

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

      <AnnonceRetour etat={etat} />

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
            Un rôle désactivé ne donne plus aucun droit. Le réactiver les rend.
          </>
        ) : (
          <>
            Réactiver ce rôle rend ses droits aux {role.comptes} personne(s) qui le portent
            encore.
          </>
        )}
      </p>

      <AnnonceRetour etat={etat} />

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
 * Suppression définitive, offerte pour tous les rôles y compris livrés.
 *
 * ⚠️ Seule garde : le service refuse un rôle encore rattaché à un compte, dont la suppression
 * retirerait un accès sans rien dire. Le bouton n'est alors pas proposé, et l'écran dit quoi
 * faire d'abord.
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

      {/*
        ⚠️ L'AVERTISSEMENT PROPRE AUX RÔLES LIVRÉS, maintenant qu'ils sont supprimables.

        Le code se réfère à ces noms — acteurs d'étape, cloisonnement par rattachement. Un rôle
        supprimé n'y correspond plus à rien : ces règles cessent simplement de le désigner, sans
        erreur et sans message. C'est le genre de conséquence qu'on ne découvre que des semaines
        plus tard, et elle se dit donc AVANT le geste.
      */}
      {role.livre && role.rattachements === 0 && (
        <Alert role="status">
          <AlertDescription>
            Ce rôle est nommé par le code : le supprimer laissera les règles qui s’y réfèrent
            sans effet, et sans erreur. Pour seulement lui retirer ses droits, désactivez-le.
          </AlertDescription>
        </Alert>
      )}

      <AnnonceRetour etat={etat} />

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

/**
 * Annonce le retour de l'opération en surimpression. NE REND RIEN.
 *
 * Le nom dit « annonce » et non « retour » : ce composant n'occupe aucune place dans la page. Il
 * existe parce que le retour doit être annoncé depuis plusieurs formulaires de ce fichier, et
 * qu'un composant se place là où l'ancien encart se trouvait — le point d'appel reste lisible.
 */
function AnnonceRetour({ etat }: { etat: EtatHabilitation }) {
  useRetourEnToast(etat)
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
          <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-caption text-secondary-600">
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
