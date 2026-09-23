'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { quitterLeSuivi, rechercherDossier, type EtatSuivi } from './actions'
import { PanneauMessagerie } from './panneau-messagerie'
import { useRetourEnToast } from '@/lib/retour-operation'

const ETAT_INITIAL: EtatSuivi = {}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso))

export function FormulaireSuivi() {
  const [etat, action, enCours] = useActionState(rechercherDossier, ETAT_INITIAL)
  useRetourEnToast(etat)

  if (etat.dossier) {
    const d = etat.dossier

    return (
      <>
        <div className="mt-8 rounded-lg border border-border p-6">
          <p className="text-label uppercase tracking-wide text-secondary-500">Référence</p>
          <p className="mt-1 font-serif text-h2 text-secondary-900">{d.reference}</p>

          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-caption text-muted-foreground">État</dt>
              <dd className="text-secondary-900">{d.statutAffiche}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Type de déclaration</dt>
              <dd className="text-secondary-900">{d.parcours}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Déposée le</dt>
              <dd className="text-secondary-900">{dateFr(d.deposeLe)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Dernière mise à jour</dt>
              <dd className="text-secondary-900">{dateFr(d.misAJourLe)}</dd>
            </div>
          </dl>
        </div>

        {etat.messagerieOuverte && <PanneauMessagerie />}

        {/*
          Une sortie explicite, et pas seulement l'expiration au bout de trente minutes : sur un
          poste partagé — cybercafé, poste d'accueil, téléphone prêté —, la personne suivante
          lirait le dossier et sa messagerie.
        */}
        <form action={quitterLeSuivi} className="mt-6">
          <Button type="submit" variant="outline" size="sm">
            Quitter le suivi
          </Button>
          <p className="mt-2 text-caption text-muted-foreground">
            À faire si vous n’êtes pas sur votre ordinateur.
          </p>
        </form>
      </>
    )
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reference">Numéro de référence</Label>
        <Input id="reference" name="reference" placeholder="EI-2026-000001" required autoComplete="off" />
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
        />
      </div>


      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? 'Recherche…' : 'Consulter mon dossier'}
      </Button>
    </form>
  )
}
