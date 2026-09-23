'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { EtatAction } from './actions'
import {
  actionMettreAJourInvestigation,
  actionOuvrirInvestigation,
} from './investigations-actions'
import { useRetourEnToast } from '@/lib/retour-operation'

/**
 * ⚠️ Une investigation n'est soumise à AUCUNE validation (décision métier du 2026-09-18).
 * La fiche n'a donc plus de statut, plus de validateur, et plus de bouton « Soumettre » ni
 * « Valider » : elle existe, elle se modifie, et elle alimente les actions correctives.
 */
export type InvestigationVue = {
  id: string
  dateOuverture: string
  faitsConstates: string
  personnesRencontrees: string | null
  causeImmediate: string | null
  causesRacines: string | null
  recommandations: string
  enqueteur: string
  /** Calculé côté serveur : les policies ne s'évaluent jamais dans le navigateur. */
  peutModifier: boolean
}

type Props = {
  dossierId: string
  investigations: InvestigationVue[]
  peutOuvrir: boolean
  /** Une fiche ne s'ouvre que sur un dossier « En investigation » (EX-INV-01). */
  dossierEnInvestigation: boolean
}

const ETAT: EtatAction = {}
const champ = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

const dateFr = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso)) : '—'

export function PanneauInvestigations({
  dossierId,
  investigations,
  peutOuvrir,
  dossierEnInvestigation,
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
          <FicheInvestigation key={i.id} investigation={i} />
        ))}
      </CardContent>
    </Card>
  )
}

function FicheInvestigation({ investigation }: { investigation: InvestigationVue }) {
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
          </p>
        </div>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <Rubrique libelle="Faits constatés" valeur={investigation.faitsConstates} />
        <Rubrique libelle="Personnes rencontrées" valeur={investigation.personnesRencontrees} />
        <Rubrique libelle="Cause immédiate" valeur={investigation.causeImmediate} />
        <Rubrique libelle="Causes racines" valeur={investigation.causesRacines} />
        <Rubrique libelle="Recommandations" valeur={investigation.recommandations} />
      </dl>

      {/* Une fiche reste modifiable : plus aucune étape ne la fige. */}
      {investigation.peutModifier && !editionVisible && (
        <div className="mt-4">
          <Button size="sm" variant="outline" onClick={() => setEditionVisible(true)}>
            Modifier
          </Button>
        </div>
      )}

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

function Rubrique({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  if (!valeur) return null

  return (
    <div>
      <dt className="text-caption text-muted-foreground">{libelle}</dt>
      <dd className="whitespace-pre-line text-secondary-800">{valeur}</dd>
    </div>
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
  useRetourEnToast(etat)

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
