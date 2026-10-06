'use client'

import { useActionState } from 'react'
import { Check, FileText, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { quitterLeSuivi, rechercherDossier, type EtatSuivi } from './actions'
import { PanneauMessagerie } from './panneau-messagerie'
import { useRetourEnToast } from '@/lib/retour-operation'

const ETAT_INITIAL: EtatSuivi = {}

type Dossier = NonNullable<EtatSuivi['dossier']>

/** Date ET heure : « 6 octobre 2026 à 14:32 ». L'heure dit si quelque chose a bougé aujourd'hui. */
const dateHeureFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso))

const dateCourteFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso))

const heureFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(iso))

/** Certains parcours saisissent la date seule, d'autres la date et l'heure : minuit = date seule. */
const dateFaitsFr = (iso: string) => {
  const date = new Date(iso)
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 ? dateFr(iso) : dateHeureFr(iso)
}

export function FormulaireSuivi() {
  const [etat, action, enCours] = useActionState(rechercherDossier, ETAT_INITIAL)
  const erreurId = etat.erreur ? 'suivi-erreur' : undefined
  useRetourEnToast(etat)

  if (etat.dossier) {
    return <VueDossier dossier={etat.dossier} messagerieOuverte={etat.messagerieOuverte === true} />
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-h1 text-secondary-900">Suivre mon dossier</h1>
      <p className="mt-2 text-sm text-secondary-600">
        Saisissez le numéro de référence et le code d’accès qui vous ont été remis lors de votre
        déclaration.
      </p>

      <form action={action} aria-busy={enCours} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reference">Numéro de référence</Label>
          <Input
            id="reference"
            name="reference"
            placeholder="EI-2026-000001"
            required
            autoComplete="off"
            aria-invalid={etat.erreur ? true : undefined}
            aria-describedby={erreurId}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="codeAcces">Code d’accès</Label>
          <Input
            id="codeAcces"
            name="codeAcces"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            required
            autoComplete="off"
            aria-invalid={etat.erreur ? true : undefined}
            aria-describedby={erreurId}
          />
        </div>

        {etat.erreur && (
          <p id="suivi-erreur" role="alert" className="text-sm text-destructive">
            {etat.erreur}
          </p>
        )}

        <Button type="submit" disabled={enCours} className="w-full">
          {enCours ? 'Recherche…' : 'Consulter mon dossier'}
        </Button>
      </form>
    </div>
  )
}

function VueDossier({ dossier: d, messagerieOuverte }: { dossier: Dossier; messagerieOuverte: boolean }) {
  return (
    <div className="space-y-6">
      {/* En-tête : qui, quoi, où en est-on — et les deux gestes possibles. */}
      <section
        aria-labelledby="titre-dossier"
        className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_28px_rgba(18,33,59,0.05)] sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label uppercase tracking-wide text-secondary-500">Mon dossier</p>
            <h1 id="titre-dossier" className="mt-1 break-all font-serif text-h2 text-secondary-900">
              {d.reference}
            </h1>
            <p className="mt-1 text-sm text-secondary-600">{d.parcours}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-800">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            {d.statutAffiche}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-border/70 pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted-foreground">Déposée le</dt>
            <dd className="mt-0.5 text-secondary-900">{dateHeureFr(d.deposeLe)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Dernière mise à jour</dt>
            <dd className="mt-0.5 text-secondary-900">{dateHeureFr(d.misAJourLe)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <Recapitulatif dossier={d} />
        </div>
      </section>

      <FriseEtats dossier={d} />

      {messagerieOuverte && <PanneauMessagerie />}

      {/*
        Une sortie explicite, et pas seulement l'expiration au bout de trente minutes : sur un
        poste partagé — cybercafé, poste d'accueil, téléphone prêté —, la personne suivante
        lirait le dossier et sa messagerie.
      */}
      <form
        action={quitterLeSuivi}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-5 py-4"
      >
        <p className="text-caption text-muted-foreground">
          Sur un appareil partagé, quittez le suivi une fois terminé.
        </p>
        <Button type="submit" variant="outline" size="sm">
          <LogOut className="h-4 w-4" aria-hidden />
          Quitter le suivi
        </Button>
      </form>
    </div>
  )
}

/**
 * Frise horizontale des états : les étapes franchies, datées à la minute, puis celles qui restent,
 * grisées. Sur téléphone, elle défile latéralement plutôt que de se tasser.
 */
function FriseEtats({ dossier: d }: { dossier: Dossier }) {
  const etapes = [
    ...d.historique.map((e, index) => ({
      libelle: e.libelle,
      le: e.le as string | null,
      etat: index === d.historique.length - 1 ? ('courante' as const) : ('franchie' as const),
    })),
    ...d.aVenir.map((libelle) => ({ libelle, le: null, etat: 'a_venir' as const })),
  ]

  return (
    <section
      aria-labelledby="titre-etapes"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_28px_rgba(18,33,59,0.05)] sm:p-6"
    >
      <h2 id="titre-etapes" className="text-sm font-semibold text-secondary-900">
        Suivi des états
      </h2>

      {/* Colonnes égales sur toute la largeur : la progression se lit d'un coup d'œil, y compris
          sur téléphone. Le défilement ne sert qu'en dernier recours, sur un écran très étroit. */}
      <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-[18rem]">
          {etapes.map((etape, index) => {
            const derniere = index === etapes.length - 1
            const atteinte = etape.etat !== 'a_venir'
            // Le trait vers l'étape suivante est plein tant que celle-ci est atteinte.
            const suivanteAtteinte = !derniere && etapes[index + 1].etat !== 'a_venir'

            return (
              <li
                key={`${etape.libelle}-${index}`}
                aria-current={etape.etat === 'courante' ? 'step' : undefined}
                className="relative flex min-w-0 flex-1 flex-col items-center px-0.5 text-center"
              >
                {!derniere && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-1/2 top-[15px] h-0.5 w-full',
                      suivanteAtteinte ? 'bg-primary' : 'bg-secondary-200'
                    )}
                  />
                )}

                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                    etape.etat === 'franchie' && 'border-primary bg-primary text-white',
                    etape.etat === 'courante' &&
                      'border-primary bg-card text-primary ring-4 ring-primary/15',
                    etape.etat === 'a_venir' && 'border-secondary-200 bg-card text-secondary-400'
                  )}
                >
                  {etape.etat === 'franchie' ? <Check className="h-4 w-4" /> : index + 1}
                </span>

                <span
                  className={cn(
                    'mt-2 text-[11px] leading-tight sm:text-xs',
                    etape.etat === 'courante' && 'font-semibold text-secondary-900',
                    etape.etat === 'franchie' && 'font-medium text-secondary-800',
                    etape.etat === 'a_venir' && 'text-secondary-400'
                  )}
                >
                  {etape.libelle}
                  {etape.etat === 'courante' && <span className="sr-only"> (état actuel)</span>}
                  {etape.etat === 'a_venir' && <span className="sr-only"> (à venir)</span>}
                </span>

                {atteinte && etape.le ? (
                  <span className="mt-1 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
                    {dateCourteFr(etape.le)}
                    <br />
                    {heureFr(etape.le)}
                  </span>
                ) : (
                  <span className="mt-1 text-[10px] leading-tight text-secondary-300 sm:text-[11px]">
                    À venir
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/** Le récapitulatif de la déclaration, dans une fenêtre modale ouverte à la demande. */
function Recapitulatif({ dossier: d }: { dossier: Dossier }) {
  const r = d.recapitulatif

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileText className="h-4 w-4" aria-hidden />
        Voir le récapitulatif
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Récapitulatif de ma déclaration</DialogTitle>
          <DialogDescription>
            {d.reference} · {d.parcours}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-caption text-muted-foreground">Catégorie</dt>
              <dd className="mt-0.5 text-secondary-900">{r.categorie}</dd>
            </div>
            {r.dateFaits && (
              <div>
                <dt className="text-caption text-muted-foreground">Date des faits</dt>
                <dd className="mt-0.5 text-secondary-900">{dateFaitsFr(r.dateFaits)}</dd>
              </div>
            )}
            {r.lieu && (
              <div>
                <dt className="text-caption text-muted-foreground">Lieu</dt>
                <dd className="mt-0.5 text-secondary-900">{r.lieu}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-caption text-muted-foreground">Description</dt>
              <dd className="mt-1 whitespace-pre-line rounded-lg bg-muted/40 p-3 text-secondary-900">
                {r.description}
              </dd>
            </div>
          </dl>
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>Fermer</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
