'use client'

import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EtatAction } from './actions'
import {
  actionAvancerAction,
  actionCloturerActionCorrective,
  actionCreerActionCorrective,
  actionVerifierEfficacite,
} from './actions-correctives-actions'
import { useRetourEnToast } from '@/lib/retour-operation'
import { formaterDateMetier } from '@/lib/date-metier'

export type ActionVue = {
  id: string
  intitule: string
  description: string
  echeance: string
  statut: string
  verificationEfficacite: boolean | null
  verificationCommentaire: string | null
  dateCloture: string | null
  responsable: string
}

type Props = {
  dossierId: string
  actions: ActionVue[]
  /** Toutes les fiches du dossier : une investigation n'est plus soumise à validation. */
  investigations: { id: string; libelle: string }[]
  droits: { creer: boolean; modifier: boolean; verifier: boolean; cloturer: boolean }
  /**
   * Une action se crée sur un dossier « Action corrective en cours » ou « Résolu » : une action
   * évaluée, efficace ou non, peut appeler une action complémentaire.
   */
  creationOuverte: boolean
}

const ETAT: EtatAction = {}
const champ = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

const LIBELLES: Record<string, string> = {
  non_demarree: 'Non démarrée',
  en_cours: 'En cours',
  realisee: 'Réalisée',
  en_retard: 'En retard',
}

/** Statut suivant proposable, selon le graphe d'avancement (EX-ACT-03). */
const SUIVANT: Record<string, { vers: string; libelle: string } | undefined> = {
  non_demarree: { vers: 'en_cours', libelle: 'Démarrer' },
  en_cours: { vers: 'realisee', libelle: 'Marquer réalisée' },
  en_retard: { vers: 'realisee', libelle: 'Marquer réalisée' },
}

const dateFr = (iso: string | null) =>
  iso ? formaterDateMetier(iso, { dateStyle: 'long' }) : '—'

export function PanneauActionsCorrectives({
  dossierId,
  actions,
  investigations,
  droits,
  creationOuverte,
}: Props) {
  const [creationVisible, setCreationVisible] = useState(false)
  const peutCreer = droits.creer && creationOuverte

  // Ouvre le formulaire en haut du panneau, où il est rendu, et l'amène à l'écran : le bouton
  // « Créer une autre action » d'une fiche peut se trouver loin en dessous.
  const ouvrirCreation = () => {
    setCreationVisible(true)
    requestAnimationFrame(() =>
      document.getElementById('creation-action')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-h3">Actions correctives</CardTitle>
        {peutCreer && !creationVisible && (
          <Button size="sm" variant="outline" onClick={ouvrirCreation}>
            Créer une action
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {actions.length === 0 && !creationVisible && (
          <p className="text-sm text-muted-foreground">
            {creationOuverte
              ? 'Aucune action corrective.'
              : 'Une action corrective ne peut être créée que sur un dossier « Action corrective en cours » ou « Résolu ».'}
          </p>
        )}

        {creationVisible && (
          <FormulaireCreation
            dossierId={dossierId}
            investigations={investigations}
            onAnnuler={() => setCreationVisible(false)}
          />
        )}

        {actions.map((a) => (
          <FicheAction
            key={a.id}
            action={a}
            droits={droits}
            onCreerAutre={peutCreer && !creationVisible ? ouvrirCreation : undefined}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function FicheAction({
  action,
  droits,
  onCreerAutre,
}: {
  action: ActionVue
  droits: Props['droits']
  /** Absent quand la création n'est pas permise, ou que le formulaire est déjà ouvert. */
  onCreerAutre?: () => void
}) {
  const suivant = SUIVANT[action.statut]
  const close = action.dateCloture !== null
  const evaluee = action.verificationEfficacite !== null

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-secondary-900">{action.intitule}</p>
          <p className="text-caption text-muted-foreground">
            Responsable : {action.responsable} · Échéance : {dateFr(action.echeance)}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={action.statut === 'en_retard' ? 'destructive' : 'secondary'}>
            {LIBELLES[action.statut] ?? action.statut}
          </Badge>
          {close && <Badge>Clôturée</Badge>}
        </div>
      </div>

      <p className="mt-2 whitespace-pre-line text-sm text-secondary-700">{action.description}</p>

      {evaluee && (
        <Alert className="mt-3">
          <AlertDescription>
            <strong className="font-medium">
              Efficacité {action.verificationEfficacite ? 'vérifiée' : 'non constatée'}
            </strong>
            {action.verificationCommentaire && ` — ${action.verificationCommentaire}`}
          </AlertDescription>
        </Alert>
      )}

      {!close && (
        <div className="mt-4 space-y-3">
          {droits.modifier && suivant && (
            <FormulaireSimple
              action={actionAvancerAction}
              champs={{ actionId: action.id, vers: suivant.vers }}
              libelle={suivant.libelle}
            />
          )}

          {/* EX-ACT-04 : la vérification n'a de sens qu'une fois l'action réalisée. */}
          {droits.verifier && action.statut === 'realisee' && action.verificationEfficacite === null && (
            <FormulaireVerification actionId={action.id} />
          )}

          {/* Clôture possible dès l'évaluation, efficace ou non. */}
          {droits.cloturer && evaluee && (
            <FormulaireSimple
              action={actionCloturerActionCorrective}
              champs={{ actionId: action.id }}
              libelle="Clôturer l’action"
            />
          )}
        </div>
      )}

      {/* Une action évaluée, efficace ou non, peut appeler une action complémentaire. */}
      {evaluee && onCreerAutre && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <p className="text-caption text-muted-foreground">
            {action.verificationEfficacite
              ? 'Une mesure complémentaire est nécessaire ?'
              : 'L’action n’a pas eu l’effet attendu : prévoyez une nouvelle action.'}
          </p>
          <Button
            size="sm"
            variant={action.verificationEfficacite ? 'outline' : 'default'}
            onClick={onCreerAutre}
          >
            Créer une autre action
          </Button>
        </div>
      )}
    </div>
  )
}

function FormulaireSimple({
  action,
  champs,
  libelle,
}: {
  action: (etat: EtatAction, donnees: FormData) => Promise<EtatAction>
  champs: Record<string, string>
  libelle: string
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)
  useRetourEnToast(etat)

  return (
    <form action={envoyer} className="space-y-2">
      {Object.entries(champs).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? 'En cours…' : libelle}
      </Button>
    </form>
  )
}

function FormulaireVerification({ actionId }: { actionId: string }) {
  const [etat, envoyer, enCours] = useActionState(actionVerifierEfficacite, ETAT)
  useRetourEnToast(etat)
  const [efficace, setEfficace] = useState('oui')

  return (
    <form action={envoyer} className="space-y-2 border-t border-border pt-3">
      <input type="hidden" name="actionId" value={actionId} />

      <Label className="text-caption">Vérification d’efficacité</Label>
      <select
        name="efficace"
        className={champ}
        value={efficace}
        onChange={(e) => setEfficace(e.target.value)}
      >
        <option value="oui">Efficace</option>
        <option value="non">Non efficace</option>
      </select>

      {/* Commentaire facultatif dans les deux cas (décision métier du 2026-10-06). */}
      <textarea
        name="commentaire"
        rows={2}
        placeholder="Commentaire (facultatif)"
        className={champ}
      />


      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? 'En cours…' : 'Enregistrer la vérification'}
      </Button>
    </form>
  )
}

function FormulaireCreation({
  dossierId,
  investigations,
  onAnnuler,
}: {
  dossierId: string
  investigations: { id: string; libelle: string }[]
  onAnnuler: () => void
}) {
  const [etat, envoyer, enCours] = useActionState(actionCreerActionCorrective, ETAT)
  useRetourEnToast(etat)

  const demain = new Date()
  demain.setDate(demain.getDate() + 1)

  return (
    <form
      id="creation-action"
      action={envoyer}
      className="scroll-mt-28 space-y-3 rounded-lg border border-border p-4"
    >
      <input type="hidden" name="dossierId" value={dossierId} />

      <div className="space-y-1.5">
        <Label htmlFor="intitule" className="text-caption">
          Intitulé *
        </Label>
        <Input id="intitule" name="intitule" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-caption">
          Description *
        </Label>
        <textarea id="description" name="description" rows={3} required className={champ} />
      </div>

      {/*
        ⚠️ SAISIE LIBRE, et non plus une liste de comptes (décision métier du 2026-09-18). Celui
        qui met en œuvre une mesure — chef d'équipe, prestataire, service entier — n'a pas
        forcément de compte sur la plateforme.
      */}
      <div className="space-y-1.5">
        <Label htmlFor="responsableNom" className="text-caption">
          Responsable *
        </Label>
        <Input
          id="responsableNom"
          name="responsableNom"
          required
          maxLength={255}
          placeholder="Nom de la personne ou du service en charge"
        />
        <p className="text-caption text-muted-foreground">
          La personne ou le service qui met en œuvre l’action, qu’elle ait ou non un compte.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="echeance" className="text-caption">
          Échéance *
        </Label>
        <input
          id="echeance"
          name="echeance"
          type="date"
          required
          min={demain.toISOString().slice(0, 10)}
          className={champ}
        />
        <p className="text-caption text-muted-foreground">
          Doit être postérieure à aujourd’hui.
        </p>
      </div>

      {investigations.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="investigationId" className="text-caption">
            Investigation d’origine
          </Label>
          <select id="investigationId" name="investigationId" className={champ}>
            <option value="">Aucune</option>
            {investigations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.libelle}
              </option>
            ))}
          </select>
        </div>
      )}


      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'En cours…' : 'Créer l’action'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onAnnuler}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
