'use client'

import { useActionState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  actionChangerStatut,
  actionQualifierGravite,
  actionCloturer,
  actionBasculerContentieux,
  actionRejeter,
  actionReouvrir,
  type EtatAction,
} from './actions'

type Option = { id: string; nom: string }

type Props = {
  dossierId: string
  statutCode: string
  /** Qui traite ce dossier — par affectation, ou par rattachement selon `parRattachement`. */
  affectations: Option[]
  /**
   * La charge découle du RATTACHEMENT et non d'une affectation.
   *
   * C'est le cas de l'évènement indésirable : il n'est affecté à personne, et revient au chargé
   * de sécurité dont le site ou la direction couvre le dossier. Sans cette distinction, la carte
   * lisait `dossier_affectations` — vide pour ce parcours — et annonçait « Personne » alors que
   * l'encadré de suivi, juste au-dessus, nommait la personne en charge. Deux affirmations
   * contraires sur le même écran.
   */
  parRattachement?: boolean
  transitions: { code: string; libelle: string }[]
  /**
   * Rôles à qui le CDC confie l'étape courante, déjà traduits en clair. Vide quand le CDC
   * n'en désigne aucun.
   */
  acteursDeLEtape: string[]
  /** Niveaux proposés à la qualification. Vide si le dossier en porte déjà un. */
  gravitesAQualifier: { valeur: string; libelle: string }[]
  droits: {
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
  parRattachement = false,
  transitions,
  acteursDeLEtape,
  gravitesAQualifier,
  droits,
  contentieux,
}: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Qui traite ce dossier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
            ⚠️ PLUS AUCUNE RÉAFFECTATION MANUELLE ici, et c'est une décision, pas un oubli.

            L'affectation découle désormais du formulaire et du rattachement : les comptes du bon
            parcours et du bon site reçoivent le dossier à sa création. Un bouton qui permettrait
            d'en désigner un autre rouvrirait, dossier par dossier, ce que cette règle ferme — et
            rien n'empêchait de confier un dossier à quelqu'un que le cloisonnement empêche de
            l'ouvrir.

            Pour changer qui reçoit quoi, on change le RATTACHEMENT du compte ou le parcours qui
            lui est confié, dans la console des comptes. La règle vaut alors pour tous les dossiers
            suivants, au lieu d'être reprise à la main sur chacun.
          */}
          {affectations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {parRattachement
                ? 'Personne pour l’instant. Un évènement indésirable revient au chargé de sécurité dont le site ou la direction couvre ce dossier — vérifiez qu’au moins un compte y est habilité.'
                : 'Personne pour l’instant. Les dossiers sont confiés aux comptes du parcours et du rattachement concernés — vérifiez qu’au moins un compte y est habilité.'}
            </p>
          ) : (
            <>
              <ul className="space-y-1 text-sm text-secondary-800">
                {affectations.map((a) => (
                  <li key={a.id}>{a.nom}</li>
                ))}
              </ul>
              {parRattachement && (
                // Dire d'où vient cette charge : elle ne se change pas ici, mais dans le
                // rattachement du compte. Sans cette ligne, on cherche un bouton qui n'existe pas.
                <p className="text-caption text-muted-foreground">
                  Au titre de leur rattachement : un évènement indésirable n’est affecté à
                  personne. Pour changer qui le traite, modifiez le site ou la direction du compte.
                </p>
              )}
            </>
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

      {/*
        Qualifier la gravité vient AVANT de faire avancer le dossier, et se voit d'abord.

        Le déclarant ne la renseigne plus sur un évènement indésirable (EI8). Tant qu'elle
        manque, le dossier n'a déclenché aucune alerte : c'est l'acte le plus urgent de l'écran,
        et il occupe donc la première carte.
      */}
      {droits.changerStatut && gravitesAQualifier.length > 0 && (
        <Card className="border-accent-300">
          <CardHeader>
            <CardTitle className="text-h3">Qualifier la gravité</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-caption text-muted-foreground">
              Ce dossier n’a pas encore de gravité. Un niveau critique alerte la Direction
              immédiatement.
            </p>
            <FormulaireAction
              action={actionQualifierGravite}
              dossierId={dossierId}
              libelleBouton="Enregistrer la gravité"
            >
              <select name="niveauGraviteId" className={champ} required>
                <option value="">— Sélectionner —</option>
                {gravitesAQualifier.map((g) => (
                  <option key={g.valeur} value={g.valeur}>
                    {g.libelle}
                  </option>
                ))}
              </select>
            </FormulaireAction>
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
