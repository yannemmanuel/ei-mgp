'use client'

import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { EtatAction } from './actions'
import {
  actionMettreAJourInvestigation,
  actionOuvrirInvestigation,
  actionSoumettreInvestigation,
  actionValiderInvestigation,
} from './investigations-actions'

export type InvestigationVue = {
  id: string
  dateOuverture: string
  statut: string
  faitsConstates: string
  personnesRencontrees: string | null
  causeImmediate: string | null
  causesRacines: string | null
  recommandations: string
  enqueteur: string
  validateur: string | null
  valideLe: string | null
  /** Calculés côté serveur : les policies ne s'évaluent jamais dans le navigateur. */
  peutModifier: boolean
  peutValider: boolean
  /** Le lecteur est l'enquêteur : il ne validera jamais cette fiche, quels que soient ses droits. */
  estLEnqueteur: boolean
}

type Props = {
  dossierId: string
  investigations: InvestigationVue[]
  peutOuvrir: boolean
  /** Une fiche ne s'ouvre que sur un dossier « En investigation » (EX-INV-01). */
  dossierEnInvestigation: boolean
  /** Rôles habilités à valider sur ce parcours, en clair — pour nommer qui doit agir. */
  validateurs: string[]
}

const ETAT: EtatAction = {}
const champ = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

const LIBELLES: Record<string, string> = {
  en_cours: 'En cours',
  en_attente_validation: 'En attente de validation',
  validee: 'Validée',
}

const dateFr = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso)) : '—'

export function PanneauInvestigations({
  dossierId,
  investigations,
  peutOuvrir,
  dossierEnInvestigation,
  validateurs,
}: Props) {
  const [ouvertureVisible, setOuvertureVisible] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-h3">Investigations</CardTitle>
        {peutOuvrir && dossierEnInvestigation && !ouvertureVisible && (
          <Button size="sm" variant="outline" onClick={() => setOuvertureVisible(true)}>
            Ouvrir une fiche
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {investigations.length === 0 && !ouvertureVisible && (
          <p className="text-sm text-muted-foreground">
            {dossierEnInvestigation
              ? 'Aucune fiche d’investigation ouverte.'
              : 'Une fiche d’investigation ne peut être ouverte que sur un dossier « En investigation ».'}
          </p>
        )}

        {ouvertureVisible && (
          <FormulaireInvestigation
            action={actionOuvrirInvestigation}
            libelleBouton="Ouvrir la fiche"
            champsCaches={{ dossierId }}
            avecDate
            onAnnuler={() => setOuvertureVisible(false)}
          />
        )}

        {investigations.map((i) => (
          <FicheInvestigation key={i.id} investigation={i} validateurs={validateurs} />
        ))}
      </CardContent>
    </Card>
  )
}

function FicheInvestigation({
  investigation,
  validateurs,
}: {
  investigation: InvestigationVue
  validateurs: string[]
}) {
  const [editionVisible, setEditionVisible] = useState(false)

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-secondary-900">
            Ouverte le {dateFr(investigation.dateOuverture)}
          </p>
          <p className="text-caption text-muted-foreground">
            Enquêteur : {investigation.enqueteur}
            {investigation.validateur && ` · Validée par ${investigation.validateur}`}
          </p>
        </div>
        <Badge variant={investigation.statut === 'validee' ? 'default' : 'secondary'}>
          {LIBELLES[investigation.statut] ?? investigation.statut}
        </Badge>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <Rubrique libelle="Faits constatés" valeur={investigation.faitsConstates} />
        <Rubrique libelle="Personnes rencontrées" valeur={investigation.personnesRencontrees} />
        <Rubrique libelle="Cause immédiate" valeur={investigation.causeImmediate} />
        <Rubrique libelle="Causes racines" valeur={investigation.causesRacines} />
        <Rubrique libelle="Recommandations" valeur={investigation.recommandations} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {investigation.peutModifier && investigation.statut === 'en_cours' && !editionVisible && (
          <Button size="sm" variant="outline" onClick={() => setEditionVisible(true)}>
            Modifier
          </Button>
        )}

        {investigation.peutModifier && investigation.statut === 'en_cours' && (
          <BoutonAction
            action={actionSoumettreInvestigation}
            investigationId={investigation.id}
            libelle="Soumettre pour validation"
          />
        )}

        {/* RGI-06 : `peutValider` est faux pour l'enquêteur lui-même — calculé côté serveur. */}
        {investigation.peutValider && investigation.statut === 'en_attente_validation' && (
          <BoutonAction
            action={actionValiderInvestigation}
            investigationId={investigation.id}
            libelle="Valider"
          />
        )}
      </div>

      {/*
        Un bouton absent se lit comme une fonction manquante — c'est le retour qui nous a été
        fait. Ne pas pouvoir valider est pourtant la situation NORMALE de l'enquêteur : la règle
        lui interdit de valider sa propre fiche. Une ligne dit donc où en est la fiche et à qui
        elle revient, plutôt que de laisser un vide à interpréter.
      */}
      <Attente investigation={investigation} validateurs={validateurs} />

      {editionVisible && (
        <div className="mt-4 border-t border-border pt-4">
          <FormulaireInvestigation
            action={actionMettreAJourInvestigation}
            libelleBouton="Enregistrer"
            champsCaches={{ investigationId: investigation.id }}
            valeurs={investigation}
            onAnnuler={() => setEditionVisible(false)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Où en est la fiche, et à qui elle revient — quand aucun bouton n'est offert au lecteur.
 *
 * Rien ne s'affiche si le lecteur a justement un geste à faire : le bouton parle pour lui-même.
 */
function Attente({
  investigation,
  validateurs,
}: {
  investigation: InvestigationVue
  validateurs: string[]
}) {
  const qui = validateurs.length > 0 ? validateurs.join(' ou ') : null

  const message = (() => {
    if (investigation.statut === 'validee') return null

    if (investigation.statut === 'en_cours') {
      if (investigation.peutModifier) return null
      return 'L’enquêteur doit d’abord soumettre cette fiche pour validation.'
    }

    // En attente de validation.
    if (investigation.peutValider) return null

    if (investigation.estLEnqueteur) {
      return qui
        ? `Vous avez mené cette investigation : elle doit être validée par quelqu’un d’autre — ${qui}.`
        : 'Vous avez mené cette investigation : elle doit être validée par quelqu’un d’autre.'
    }

    return qui ? `En attente de validation par : ${qui}.` : 'En attente de validation.'
  })()

  if (message === null) return null

  return <p className="mt-3 text-caption text-muted-foreground">{message}</p>
}

function Rubrique({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  if (!valeur) return null

  return (
    <div>
      <dt className="text-caption text-muted-foreground">{libelle}</dt>
      <dd className="whitespace-pre-line text-secondary-800">{valeur}</dd>
    </div>
  )
}

function BoutonAction({
  action,
  investigationId,
  libelle,
}: {
  action: (etat: EtatAction, donnees: FormData) => Promise<EtatAction>
  investigationId: string
  libelle: string
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)

  return (
    <form action={envoyer} className="space-y-2">
      <input type="hidden" name="investigationId" value={investigationId} />
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? 'En cours…' : libelle}
      </Button>
      {etat.erreur && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{etat.erreur}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

function FormulaireInvestigation({
  action,
  libelleBouton,
  champsCaches,
  valeurs,
  avecDate,
  onAnnuler,
}: {
  action: (etat: EtatAction, donnees: FormData) => Promise<EtatAction>
  libelleBouton: string
  champsCaches: Record<string, string>
  valeurs?: Partial<InvestigationVue>
  avecDate?: boolean
  onAnnuler: () => void
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)

  return (
    <form action={envoyer} className="space-y-3">
      {Object.entries(champsCaches).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}

      {avecDate && (
        <div className="space-y-1.5">
          <Label htmlFor="dateOuverture" className="text-caption">
            Date d’ouverture *
          </Label>
          <input
            id="dateOuverture"
            name="dateOuverture"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={champ}
          />
        </div>
      )}

      <Zone nom="faitsConstates" libelle="Faits constatés *" requis defaut={valeurs?.faitsConstates} />
      <Zone nom="personnesRencontrees" libelle="Personnes rencontrées" defaut={valeurs?.personnesRencontrees} />
      <Zone nom="causeImmediate" libelle="Cause immédiate" defaut={valeurs?.causeImmediate} />
      <Zone nom="causesRacines" libelle="Causes racines" defaut={valeurs?.causesRacines} />
      <Zone
        nom="recommandations"
        libelle="Recommandations *"
        requis
        defaut={valeurs?.recommandations}
        aide="Source des actions correctives (EX-INV-04)."
      />

      {etat.erreur && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{etat.erreur}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'En cours…' : libelleBouton}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onAnnuler}>
          Annuler
        </Button>
      </div>
    </form>
  )
}

function Zone({
  nom,
  libelle,
  requis,
  defaut,
  aide,
}: {
  nom: string
  libelle: string
  requis?: boolean
  defaut?: string | null
  aide?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={nom} className="text-caption">
        {libelle}
      </Label>
      <textarea
        id={nom}
        name={nom}
        rows={3}
        required={requis}
        defaultValue={defaut ?? ''}
        className={champ}
      />
      {aide && <p className="text-caption text-muted-foreground">{aide}</p>}
    </div>
  )
}
