'use client'

import { useActionState, useState } from 'react'
import { Building2, MapPin } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EnTetePage } from '@/components/layout/en-tete-page'
import type { EtatFormulaire } from '../editeur-referentiel'
import {
  actionEnregistrerDirection,
  actionEnregistrerSite,
  actionRattacherDirection,
} from '../actions'

export type DirectionVue = {
  id: string
  code: string
  libelle: string
  actif: boolean
  siteId: string | null
  /** Comptes rattachés à cette direction — un détachement les concerne. */
  comptes: number
}

export type SiteVue = {
  id: string
  code: string
  libelle: string
  actif: boolean
  comptes: number
}

const ETAT: EtatFormulaire = {}
const champ = 'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

/**
 * Sites et directions, dans un seul écran.
 *
 * Les deux référentiels décrivent la même organisation et ne se lisent pas séparément : la
 * question qu'on se pose devant eux n'est jamais « quels sites existent ? » mais « quelles
 * directions relèvent de quel site ? ». Deux consoles distinctes obligeaient à ouvrir chaque
 * direction pour lire — puis changer — une information qui n'a de sens que rapportée au site.
 *
 * Le rattachement se fait donc depuis la liste, sans ouvrir de formulaire : déplacer vingt
 * directions ne doit pas demander vingt formulaires.
 *
 * Aucune suppression, ici comme ailleurs (RG-03) : un site ou une direction déjà cité par un
 * dossier ne peut pas disparaître sans rendre l'historique incohérent. La désactivation en tient
 * lieu — et un site ne se désactive pas tant que des directions y sont rattachées.
 */
export function PanneauOrganisation({
  sites,
  directions,
}: {
  sites: SiteVue[]
  directions: DirectionVue[]
}) {
  const [creation, setCreation] = useState<'site' | 'direction' | null>(null)
  const [siteEnEdition, setSiteEnEdition] = useState<SiteVue | null>(null)
  const [directionEnEdition, setDirectionEnEdition] = useState<DirectionVue | null>(null)

  const orphelines = directions.filter((d) => d.siteId === null && d.actif)
  const sitesActifs = sites.filter((s) => s.actif)

  function fermer() {
    setCreation(null)
    setSiteEnEdition(null)
    setDirectionEnEdition(null)
  }

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Sites et directions"
        lede="Un site regroupe plusieurs directions. C’est la direction qui donne son site à un dossier, et donc la personne qui le recevra."
        mailles={[
          { libelle: 'Administration', href: '/administration' },
          { libelle: 'Sites et directions' },
        ]}
        compteur={`${sites.length} sites · ${directions.length} directions`}
        actions={
          creation === null && siteEnEdition === null && directionEnEdition === null ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setCreation('site')}>
                Ajouter un site
              </Button>
              <Button size="sm" onClick={() => setCreation('direction')}>
                Ajouter une direction
              </Button>
            </>
          ) : null
        }
      />

      {creation === 'site' && <FormulaireSite onFermer={fermer} />}
      {siteEnEdition && <FormulaireSite site={siteEnEdition} onFermer={fermer} />}
      {creation === 'direction' && <FormulaireDirection sites={sitesActifs} onFermer={fermer} />}
      {directionEnEdition && (
        <FormulaireDirection direction={directionEnEdition} sites={sitesActifs} onFermer={fermer} />
      )}

      {orphelines.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">
              {orphelines.length > 1
                ? `${orphelines.length} directions ne relèvent d’aucun site.`
                : '1 direction ne relève d’aucun site.'}
            </p>
            <p className="mt-1 text-caption">
              Une déclaration qui les vise produit un dossier sans site : aucun secrétaire habilité
              par site ne le verra, seuls les rôles transverses y auront accès.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {sites.map((site) => (
        <BlocSite
          key={site.id}
          site={site}
          directions={directions.filter((d) => d.siteId === site.id)}
          sites={sitesActifs}
          onModifier={() => {
            fermer()
            setSiteEnEdition(site)
          }}
          onModifierDirection={(direction) => {
            fermer()
            setDirectionEnEdition(direction)
          }}
        />
      ))}

      <Card className={orphelines.length > 0 ? 'border-destructive/40' : undefined}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-secondary-400" aria-hidden />
            <p className="text-h3 text-secondary-900">Sans site</p>
            <Badge variant={orphelines.length > 0 ? 'destructive' : 'secondary'}>
              {directions.filter((d) => d.siteId === null).length}
            </Badge>
          </div>

          <ListeDirections
            directions={directions.filter((d) => d.siteId === null)}
            sites={sitesActifs}
            siteCourant={null}
            messageVide="Toutes les directions sont rattachées."
            onModifier={(direction) => {
              fermer()
              setDirectionEnEdition(direction)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function BlocSite({
  site,
  directions,
  sites,
  onModifier,
  onModifierDirection,
}: {
  site: SiteVue
  directions: DirectionVue[]
  sites: SiteVue[]
  onModifier: () => void
  onModifierDirection: (direction: DirectionVue) => void
}) {
  return (
    <Card className={site.actif ? undefined : 'border-dashed bg-muted/30'}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-secondary-400" aria-hidden />
              <p className={`text-h3 ${site.actif ? 'text-secondary-900' : 'text-secondary-500'}`}>
                {site.libelle}
              </p>
              {!site.actif && <Badge variant="destructive">Désactivé</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-caption text-muted-foreground">{site.code}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {directions.length} direction{directions.length > 1 ? 's' : ''}
            </Badge>
            <Badge variant="secondary">
              {site.comptes} compte{site.comptes > 1 ? 's' : ''}
            </Badge>
            <Button size="sm" variant="outline" onClick={onModifier}>
              Modifier
            </Button>
          </div>
        </div>

        <ListeDirections
          directions={directions}
          sites={sites}
          siteCourant={site.id}
          messageVide="Aucune direction rattachée à ce site."
          onModifier={onModifierDirection}
        />
      </CardContent>
    </Card>
  )
}

function ListeDirections({
  directions,
  sites,
  siteCourant,
  messageVide,
  onModifier,
}: {
  directions: DirectionVue[]
  sites: SiteVue[]
  siteCourant: string | null
  messageVide: string
  onModifier: (direction: DirectionVue) => void
}) {
  if (directions.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{messageVide}</p>
  }

  return (
    <ul className="mt-3 divide-y divide-border">
      {directions.map((direction) => (
        <li key={direction.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p
              className={`text-sm font-medium ${
                direction.actif ? 'text-secondary-900' : 'text-secondary-500'
              }`}
            >
              {direction.libelle}
              {!direction.actif && (
                <span className="ml-2 text-caption font-normal text-destructive">désactivée</span>
              )}
            </p>
            <p className="font-mono text-caption text-muted-foreground">
              {direction.code}
              {direction.comptes > 0 && (
                <span className="ml-2 font-sans">
                  · {direction.comptes} compte{direction.comptes > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DeplacerDirection direction={direction} sites={sites} siteCourant={siteCourant} />
            <Button size="sm" variant="ghost" onClick={() => onModifier(direction)}>
              Modifier
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Le geste d'affectation : une liste déroulante qui soumet d'elle-même, sans formulaire à ouvrir. */
function DeplacerDirection({
  direction,
  sites,
  siteCourant,
}: {
  direction: DirectionVue
  sites: SiteVue[]
  siteCourant: string | null
}) {
  const [etat, envoyer, enCours] = useActionState(actionRattacherDirection, ETAT)

  return (
    <form action={envoyer} className="flex items-center gap-2">
      <input type="hidden" name="directionId" value={direction.id} />
      <label className="sr-only" htmlFor={`site-${direction.id}`}>
        Site de {direction.libelle}
      </label>
      <select
        id={`site-${direction.id}`}
        name="siteId"
        defaultValue={siteCourant ?? ''}
        disabled={enCours}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">— Aucun site —</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.libelle}
          </option>
        ))}
      </select>
      {etat.erreur && <span className="text-caption text-destructive">{etat.erreur}</span>}
    </form>
  )
}

function FormulaireSite({ site, onFermer }: { site?: SiteVue; onFermer: () => void }) {
  const [etat, envoyer, enCours] = useActionState(actionEnregistrerSite, ETAT)

  return (
    <Card>
      <CardContent className="p-4">
        <form action={envoyer} className="space-y-4">
          {site && <input type="hidden" name="id" value={site.id} />}

          <p className="text-h3 text-secondary-900">
            {site ? `Modifier « ${site.libelle} »` : 'Nouveau site'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="code-site" className="text-caption text-muted-foreground">
                Code
              </Label>
              <Input id="code-site" name="code" defaultValue={site?.code ?? ''} required maxLength={100} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="libelle-site" className="text-caption text-muted-foreground">
                Libellé
              </Label>
              <Input id="libelle-site" name="libelle" defaultValue={site?.libelle ?? ''} required maxLength={255} className="mt-1" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="actif" value="1" defaultChecked={site?.actif ?? true} />
            Actif
          </label>

          <Retour etat={etat} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onFermer}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FormulaireDirection({
  direction,
  sites,
  onFermer,
}: {
  direction?: DirectionVue
  sites: SiteVue[]
  onFermer: () => void
}) {
  const [etat, envoyer, enCours] = useActionState(actionEnregistrerDirection, ETAT)

  return (
    <Card>
      <CardContent className="p-4">
        <form action={envoyer} className="space-y-4">
          {direction && <input type="hidden" name="id" value={direction.id} />}

          <p className="text-h3 text-secondary-900">
            {direction ? `Modifier « ${direction.libelle} »` : 'Nouvelle direction'}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="code-direction" className="text-caption text-muted-foreground">
                Code
              </Label>
              <Input id="code-direction" name="code" defaultValue={direction?.code ?? ''} required maxLength={100} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="libelle-direction" className="text-caption text-muted-foreground">
                Libellé
              </Label>
              <Input id="libelle-direction" name="libelle" defaultValue={direction?.libelle ?? ''} required maxLength={255} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="site-direction" className="text-caption text-muted-foreground">
                Site
              </Label>
              <select
                id="site-direction"
                name="siteId"
                defaultValue={direction?.siteId ?? ''}
                className={champ}
              >
                <option value="">— Aucun —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="actif" value="1" defaultChecked={direction?.actif ?? true} />
            Active
          </label>

          <Retour etat={etat} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onFermer}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Retour({ etat }: { etat: EtatFormulaire }) {
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
