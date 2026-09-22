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
  retirees: string[]
  ajoutees: string[]
  /** Rôle du CDC, nommé par le code : modifiable et désactivable, jamais supprimable. */
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
      <ul className="divide-y divide-border">
        {roles.map((role) => {
          const estChoisi = role.role === selection
          const modifie = role.retirees.length > 0 || role.ajoutees.length > 0

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
                  {/* Le détail de l'ajustement tient dans l'infobulle : énumérer les droits
                      ajoutés et retirés sur chaque ligne délignerait la liste. */}
                  {modifie && (
                    <span
                      title={[
                        role.ajoutees.length > 0
                          ? `${role.ajoutees.length} droit(s) ajouté(s)`
                          : null,
                        role.retirees.length > 0
                          ? `${role.retirees.length} droit(s) retiré(s)`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    >
                      <EtiquetteStatut ton="attention">Ajusté</EtiquetteStatut>
                    </span>
                  )}
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
 * ⚠️ La DÉSACTIVATION est ici, en évidence, plutôt que dans un onglet. C'est le geste qu'on vient
 * faire quand un rôle pose problème, et le chercher derrière un onglet nommé « Activation »
 * supposait de deviner où il se trouvait. Sa confirmation, elle, reste : elle énonce combien de
 * personnes perdent leurs droits d'un coup.
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
              {!role.livre && <EtiquetteStatut ton="attention">Créé ici</EtiquetteStatut>}
            </div>
            <p className="mt-0.5 font-mono text-caption text-muted-foreground">{role.role}</p>
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
          ) : (
            <>
              {resume.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ce rôle ne permet rien pour l’instant.
                </p>
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

              <p className="text-caption text-muted-foreground">
                {role.parcours.length === 0
                  ? 'N’ouvre aucun type de déclaration — ses porteurs ne voient aucun dossier.'
                  : role.tousLesParcours
                    ? 'Ouvre tous les types de déclaration.'
                    : `Ouvre : ${role.parcours.map((p) => p.libelle).join(' · ')}.`}
              </p>

              {/*
                CE QU'IL FAIT AVANCER, et ce qu'il voit — résumé en une ligne.

                ⚠️ « Ne fait avancer aucun dossier » est la situation par défaut d'un rôle créé
                ici, et elle est invisible autrement : les droits sont cochés, le type est ouvert,
                le bouton de changement de statut reste absent et rien ne dit pourquoi. C'est
                exactement ce que ce résumé doit attraper.
              */}
              <p className="text-caption text-muted-foreground">
                {role.etapes.length === 0
                  ? 'Ne fait avancer aucun dossier — aucune étape cochée.'
                  : `Fait avancer ${role.etapes.length} étape(s).`}
                {comportementsDisponibles
                  .filter((c) => role.comportements[c.cle] !== VALEUR_PAR_DEFAUT[c.cle])
                  .map((c) => ` · ${role.comportements[c.cle] ? c.libelle : `Pas de « ${c.libelle.toLowerCase()} »`}`)
                  .join('')}
              </p>
            </>
          )}
        </div>

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
              /*
                ⚠️ L'ONGLET EST OFFERT POUR TOUS LES RÔLES depuis le 2026-09-20.

                Il était masqué pour les rôles livrés, que le service refusait alors d'emblée. Le
                service ne regarde plus que l'attribution — c'est la règle demandée —, mais
                l'écran, lui, continuait de cacher le geste : la règle avait changé côté serveur
                sans que rien ne soit atteignable côté écran.
              */
              { cle: 'activation' as const, libelle: 'Supprimer' },
            ]}
          />

          <div className="mt-4">
            <div
              role="tabpanel"
              aria-labelledby={`onglet-${role.role}-droits`}
              hidden={onglet !== 'droits'}
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
              aria-labelledby={`onglet-${role.role}-declarations`}
              hidden={onglet !== 'declarations'}
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
              aria-labelledby={`onglet-${role.role}-etapes`}
              hidden={onglet !== 'etapes'}
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
              aria-labelledby={`onglet-${role.role}-comportements`}
              hidden={onglet !== 'comportements'}
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
              aria-labelledby={`onglet-${role.role}-nom`}
              hidden={onglet !== 'nom'}
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
              aria-labelledby={`onglet-${role.role}-activation`}
              hidden={onglet !== 'activation'}
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
 * ⚠️ L'avertissement n'est pas décoratif, et il a CHANGÉ DE SENS le 2026-09-21. Il disait qu'un
 * rôle créé ici ne donnait accès à aucun dossier, parce que le cloisonnement par type vivait dans
 * le code et ne nommait que les rôles livrés. Tout se coche maintenant : ce qu'il faut dire avant
 * la création, ce n'est plus « ce rôle ne pourra rien », c'est « il ne pourra rien TANT QUE rien
 * n'est coché » — et où aller le cocher.
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
              Un rôle créé ici se paramètre entièrement : ses droits, les types de déclaration
              qu’il ouvre, les étapes qu’il peut franchir et son comportement. Il n’ouvre{' '}
              <strong>aucun dossier tant que rien n’est coché</strong> — c’est l’onglet
              « Déclarations » qui lui donne un périmètre, et « Étapes » qui lui permet de faire
              avancer un dossier.
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

/**
 * Sur quels types de déclaration ce rôle est habilité.
 *
 * ⚠️ CE GESTE CHANGE CE QUE DES GENS VOIENT, tout de suite et pour tous les porteurs du rôle : le
 * périmètre est relu en base à chaque requête. Décocher « Grief employé » retire ces dossiers de
 * la vue de chacun d'eux sans attendre une reconnexion.
 *
 * L'écran le dit AVANT le geste, et l'énonce encore quand il ne reste rien de coché : un rôle
 * sans aucun type ne montre aucun dossier, ce qui ressemble à une panne quand on l'a fait sans
 * le savoir.
 */
/**
 * Les quatre comportements du rôle — ce qui ne se dit ni par un droit, ni par un type, ni par une
 * étape.
 *
 * ⚠️ TOUS LES QUATRE ÉTAIENT ÉCRITS DANS LE CODE, sous forme de listes de noms de rôles. Un rôle
 * créé depuis l'interface ne figurait dans aucune : il n'était borné par aucun rattachement,
 * voyait l'identité de tous les déclarants, et rien ne le disait à qui venait de le créer.
 *
 * ⚠️ « A LA CHARGE » N'EST PAS « peut faire avancer un dossier », qui est un droit. Celui-ci dit
 * qui en RÉPOND. Le Service MGP arbitre et relance sans instruire : il porte le droit, pas la
 * charge. La distinction avait été manquée, et il apparaissait comme titulaire de tous les
 * dossiers. Les libellés viennent du serveur pour que l'écran et le code disent la même chose.
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
        Ce que ce rôle fait de particulier, au-delà de ses droits. Ces quatre réglages étaient
        écrits dans le code, rôle par rôle : un rôle créé ici n’en portait aucun, et rien ne le
        disait.
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
            Ses porteurs liront les dossiers sans jamais voir qui a déclaré, ni le poste du
            déclarant — y compris sur les déclarations identifiées.
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
 * ⚠️ CETTE GRILLE ÉTAIT UNE TABLE DU CODE. Un rôle créé depuis l’interface n’y figurait pas : ses
 * porteurs voyaient le dossier, portaient le droit de le faire avancer, et le bouton restait
 * absent sans qu’aucun message ne l’explique. C’est le réglage le plus silencieux du dispositif,
 * et c’est pourquoi il a sa propre grille plutôt qu’une ligne de plus ailleurs.
 *
 * ⚠️ UNE CASE VIDE INTERDIT. Il n’y a plus d’étape « ouverte à tous » : ce qui n’est pas coché
 * n’est pas permis.
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
        décochée interdit : le bouton de changement d’étape n’apparaît pas à ses porteurs.
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
            Aucune étape cochée : les porteurs de ce rôle ne pourront faire avancer aucun dossier,
            même s’ils en ont le droit et qu’ils le voient.
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
        Les types de déclaration que ce rôle ouvre. Ses porteurs ne verront que ceux-ci —
        le rattachement au site ou à la direction restreint ensuite à l’intérieur.
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
            Aucun type coché : les porteurs de ce rôle ne verront aucun dossier. C’est le
            paramétrage attendu pour un rôle d’administration ou de saisie, et une panne pour tout
            autre.
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
    Tout est déplié d'emblée, et c'est un retour en arrière assumé.

    Replier les domaines que le rôle ne touche pas encore réduisait bien le défilement — mais on
    venait ici pour ACCORDER un droit, c'est-à-dire précisément un droit que le rôle n'a pas :
    celui qu'on cherche était donc systématiquement caché. On se perdait à ouvrir les domaines un
    par un pour retrouver « valider une investigation ».

    Ce qui règle vraiment le problème n'est pas le repliement, c'est la recherche : on tape trois
    lettres, on voit les droits qui correspondent, tous domaines confondus. Le repliement reste
    disponible pour qui veut réduire la page, il n'est simplement plus le comportement par défaut.
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
 * Suppression définitive.
 *
 * ⚠️ OFFERTE POUR TOUS LES RÔLES, y compris les rôles livrés. Ce commentaire réservait le geste
 * aux rôles créés ici, « le cloisonnement par parcours, la table des acteurs d'étape et
 * l'habilitation par site nommant les rôles livrés ». Aucune de ces trois tables n'existe plus
 * dans le code depuis le 2026-09-21 : supprimer un rôle livré ne casse plus rien, et le métier l'a
 * demandé.
 *
 * Ce qui reste vrai — et c'est la seule garde : le service refuse un rôle encore rattaché à un
 * compte. Le supprimer retirerait un accès sans que rien ne le dise, et l'association partirait
 * avec lui. Le bouton n'est donc même pas proposé dans ce cas — l'écran dit quoi faire d'abord.
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
            Ce rôle est nommé par le code : les règles d’étape et de cloisonnement s’y réfèrent.
            Le supprimer ne provoquera aucune erreur — elles cesseront simplement de le désigner.
            Si vous voulez seulement lui retirer ses droits, désactivez-le plutôt.
          </AlertDescription>
        </Alert>
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
