'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { EtatSuppression } from './suppressions-actions'

const ETAT: EtatSuppression = {}

/**
 * Bouton de suppression, pour les écrans qui n'utilisent pas `EditeurReferentiel`.
 *
 * Celui-ci porte déjà la sienne ; les panneaux propres — organisation, QR codes, comptes — n'ont
 * rien d'équivalent. Plutôt que de recopier la mécanique trois fois, elle vit ici.
 *
 * ⚠️ UN CLIC NE SUFFIT PAS. Le premier arme, le second confirme, et le libellé nomme ce qui va
 * disparaître. Une suppression ne s'annule pas : la seule chose qui la rattrape est de ne pas
 * l'avoir déclenchée par mégarde sur la ligne d'à côté.
 *
 * ⚠️ Et ce n'est pas parce que le bouton est là que la ligne partira. Le service compte d'abord ce
 * qui la cite et refuse tant que ce compte n'est pas nul. Le refus revient ici et s'affiche tel
 * quel — c'est lui qui nomme ce qui s'oppose et propose la désactivation.
 */
export function BoutonSupprimer({
  id,
  nom,
  action,
  libelle = 'Supprimer',
}: {
  id: string
  /** Ce qui va disparaître, en clair : la confirmation le répète. */
  nom: string
  action: (etat: EtatSuppression, donnees: FormData) => Promise<EtatSuppression>
  libelle?: string
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)
  const [arme, setArme] = useState(false)

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {arme ? (
        <form action={envoyer} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <span className="text-caption text-muted-foreground">Supprimer « {nom} » ?</span>
          <Button type="submit" size="sm" variant="destructive" disabled={enCours}>
            {enCours ? 'Suppression…' : 'Confirmer'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setArme(false)}
            disabled={enCours}
          >
            Annuler
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setArme(true)}>
          {libelle}
        </Button>
      )}

      {/*
        Le refus s'affiche SOUS le bouton, et il y reste.

        C'est le message qui nomme ce qui cite la ligne — « 30 dossiers » — et renvoie vers la
        désactivation. Le réduire à une alerte fugace priverait le refus de la moitié qui sert.
      */}
      {etat.erreur && (
        <span className="max-w-xs text-right text-caption text-destructive">{etat.erreur}</span>
      )}
    </span>
  )
}
