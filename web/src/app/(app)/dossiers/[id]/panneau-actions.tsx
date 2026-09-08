'use client'

import { useActionState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  actionChangerStatut,
  actionCloturer,
  actionBasculerContentieux,
  actionReaffecter,
  actionRejeter,
  actionReouvrir,
  type EtatAction,
} from './actions'

type Option = { id: string; nom: string }

type Props = {
  dossierId: string
  statutCode: string
  affectations: Option[]
  affectables: Option[]
  transitions: { code: string; libelle: string }[]
  /**
   * Rôles à qui le CDC confie l'étape courante, déjà traduits en clair. Vide quand le CDC
   * n'en désigne aucun.
   */
  acteursDeLEtape: string[]
  droits: {
    reaffecter: boolean
    changerStatut: boolean
    cloturer: boolean
    reouvrir: boolean
    /** RG-11 : réservé au DPO (`rgpd.conservation.manage`). */
    gererContentieux: boolean
  }
  contentieux: boolean
}

const ETAT: EtatAction = {}
const champ = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

/**
 * Panneau d'actions de la fiche dossier.
 *
 * Les commandes sont masquées selon les droits reçus du serveur, MAIS chaque Server Action
 * revérifie l'autorisation de son côté : ce masquage est une commodité, jamais un contrôle
 * d'accès.
 */
export function PanneauActions({
  dossierId,
  statutCode,
  affectations,
  affectables,
  transitions,
  acteursDeLEtape,
  droits,
  contentieux,
}: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Affectation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {affectations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun responsable affecté.</p>
          ) : (
            <ul className="space-y-1 text-sm text-secondary-800">
              {affectations.map((a) => (
                <li key={a.id}>{a.nom}</li>
              ))}
            </ul>
          )}

          {droits.reaffecter && (
            <FormulaireAction
              action={actionReaffecter}
              dossierId={dossierId}
              libelleBouton="Réaffecter"
            >
              <div className="space-y-1.5">
                <Label htmlFor="nouvelUtilisateurId" className="text-caption">
                  Réaffecter à
                </Label>
                <select id="nouvelUtilisateurId" name="nouvelUtilisateurId" className={champ} required>
                  <option value="">— Sélectionner —</option>
                  {affectables.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="motif" className="text-caption">
                  Motif *
                </Label>
                <textarea id="motif" name="motif" rows={2} required minLength={5} className={champ} />
              </div>
            </FormulaireAction>
          )}
        </CardContent>
      </Card>

      {/*
        Ne pas pouvoir faire avancer un dossier est une situation NORMALE : chaque étape revient
        à des acteurs désignés (docs/workflows.md §3). Sans cette carte, l'absence de bouton
        passait pour une panne ou un oubli de droits, et le dossier semblait « coincé » sans
        qu'on sache chez qui il attendait.
      */}
      {!droits.changerStatut && acteursDeLEtape.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Étape suivante</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-secondary-700">
              Cette étape revient à : <strong>{acteursDeLEtape.join(', ')}</strong>.
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              Vous pouvez le consulter et échanger par la messagerie.
            </p>
          </CardContent>
        </Card>
      )}

      {droits.changerStatut && transitions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Changer le statut</CardTitle>
          </CardHeader>
          <CardContent>
            <FormulaireAction
              action={actionChangerStatut}
              dossierId={dossierId}
              libelleBouton="Mettre à jour"
            >
              <select name="vers" className={champ} required>
                <option value="">— Sélectionner —</option>
                {transitions.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.libelle}
                  </option>
                ))}
              </select>
              <textarea
                name="commentaire"
                rows={2}
                placeholder="Commentaire (facultatif)"
                className={champ}
              />
            </FormulaireAction>
          </CardContent>
        </Card>
      )}

      {/* Le rejet n'est possible que depuis « En analyse » : proposer la commande ailleurs
          n'aboutirait qu'à un refus du service. */}
      {droits.changerStatut && statutCode === 'en_analyse' && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-h3 text-destructive">Rejeter (non recevable)</CardTitle>
          </CardHeader>
          <CardContent>
            <FormulaireAction
              action={actionRejeter}
              dossierId={dossierId}
              libelleBouton="Rejeter le dossier"
              variante="destructive"
            >
              <textarea
                name="motif"
                rows={2}
                required
                minLength={5}
                placeholder="Motif du rejet *"
                className={champ}
              />
            </FormulaireAction>
          </CardContent>
        </Card>
      )}

      {droits.cloturer && statutCode === 'resolu' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Clôturer</CardTitle>
          </CardHeader>
          <CardContent>
            <FormulaireAction
              action={actionCloturer}
              dossierId={dossierId}
              libelleBouton="Clôturer le dossier"
            >
              <textarea
                name="syntheseResolution"
                rows={3}
                required
                minLength={10}
                placeholder="Synthèse de résolution *"
                className={champ}
              />
            </FormulaireAction>
          </CardContent>
        </Card>
      )}

      {droits.reouvrir && statutCode === 'cloture' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Rouvrir le dossier</CardTitle>
          </CardHeader>
          <CardContent>
            <FormulaireAction
              action={actionReouvrir}
              dossierId={dossierId}
              libelleBouton="Réouvrir le dossier"
            >
              <textarea
                name="motif"
                rows={2}
                required
                minLength={5}
                placeholder="Motif de réouverture *"
                className={champ}
              />
            </FormulaireAction>
          </CardContent>
        </Card>
      )}

      {droits.gererContentieux && (
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Conservation des données</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-secondary-700">
              {contentieux
                ? 'Dossier en contentieux : les données sont conservées jusqu’à nouvel ordre.'
                : 'Archivage à 24 mois, anonymisation 10 ans après la clôture.'}
            </p>

            <FormulaireAction
              action={actionBasculerContentieux}
              dossierId={dossierId}
              libelleBouton={contentieux ? 'Lever le blocage' : 'Marquer en contentieux'}
            >
              <p className="text-caption text-muted-foreground">
                Seul le délégué à la protection des données peut poser ou lever ce blocage.
              </p>
            </FormulaireAction>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FormulaireAction({
  action,
  dossierId,
  libelleBouton,
  variante,
  children,
}: {
  action: (etat: EtatAction, donnees: FormData) => Promise<EtatAction>
  dossierId: string
  libelleBouton: string
  variante?: 'destructive'
  children: React.ReactNode
}) {
  const [etat, envoyer, enCours] = useActionState(action, ETAT)

  return (
    <form action={envoyer} className="space-y-3">
      <input type="hidden" name="dossierId" value={dossierId} />
      {children}

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

      <Button type="submit" variant={variante} disabled={enCours} className="w-full">
        {enCours ? 'En cours…' : libelleBouton}
      </Button>
    </form>
  )
}
