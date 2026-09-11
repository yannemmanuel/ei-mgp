import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EtiquetteStatut } from '@/components/ui/etiquette-statut'

/**
 * Le suivi d'un évènement indésirable, en un coup d'œil.
 *
 * Quatre informations que le métier demande de voir « pour chaque EI » : le délai, la personne en
 * charge, le plan d'action et la gravité. Elles existaient déjà sur la fiche, mais éparpillées —
 * la gravité en étiquette d'en-tête, l'échéance à côté, le plan d'action dans un panneau plus bas
 * qu'il fallait dérouler, et la personne en charge nulle part, l'évènement n'étant plus affecté.
 *
 * Le chargé de sécurité arrive ici après un comité, avec une décision à consigner. Ce qu'il lui
 * faut d'abord, c'est l'état d'ensemble ; le détail reste à sa place, un peu plus bas.
 *
 * ⚠️ Chaque case sait dire qu'elle est VIDE, et pourquoi. « — » à la place d'un nom se lit comme
 * un défaut d'affichage ; « Aucun chargé de sécurité sur ce site » se lit comme ce que c'est :
 * un paramétrage à faire, et un dossier que personne ne suit.
 */
export function BlocSuiviEi({
  enCharge,
  gravite,
  joursRestants,
  actionsOuvertes,
  actionsTotal,
  actionsEnRetard,
  prochaineEcheance,
}: {
  enCharge: readonly string[]
  gravite: string | null
  joursRestants: number | null
  actionsOuvertes: number
  actionsTotal: number
  actionsEnRetard: number
  prochaineEcheance: string | null
}) {
  return (
    <Card className="p-5">
      <h2 className="text-h3 text-secondary-900">Suivi de l’évènement</h2>
      <p className="mt-1 text-caption text-muted-foreground">
        Complété par le chargé de sécurité du site après chaque comité.
      </p>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Case libelle="Délai">
          {joursRestants === null ? (
            <Vide>Aucune échéance suivie à cette étape</Vide>
          ) : (
            <EtiquetteStatut
              ton={joursRestants < 0 ? 'alerte' : joursRestants <= 3 ? 'attention' : 'neutre'}
            >
              {joursRestants < 0
                ? `En retard de ${Math.abs(joursRestants)} j`
                : joursRestants === 0
                  ? 'Échéance aujourd’hui'
                  : `${joursRestants} j restants`}
            </EtiquetteStatut>
          )}
        </Case>

        <Case libelle="Personne en charge">
          {enCharge.length === 0 ? (
            /* Pas un tiret : le dossier n'est suivi par personne, et c'est réparable. */
            <Vide>
              Aucun chargé de sécurité sur ce site —{' '}
              <Link
                href="/administration/utilisateurs"
                className="underline underline-offset-2 hover:text-secondary-900"
              >
                en désigner un
              </Link>
            </Vide>
          ) : (
            <span className="text-sm text-secondary-900">{enCharge.join(', ')}</span>
          )}
        </Case>

        <Case libelle="Plan d’action">
          {actionsTotal === 0 ? (
            <Vide>Aucune action définie</Vide>
          ) : (
            <span className="text-sm text-secondary-900">
              {actionsOuvertes} en cours sur {actionsTotal}
              {actionsEnRetard > 0 && (
                <span className="ml-1.5 text-destructive">
                  · {actionsEnRetard} en retard
                </span>
              )}
              {prochaineEcheance && (
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  prochaine échéance le {prochaineEcheance}
                </span>
              )}
            </span>
          )}
        </Case>

        <Case libelle="Gravité">
          {gravite === null ? (
            /* La gravité de l'EI n'est plus demandée au déclarant : elle se qualifie ici. Le dire
               vaut mieux qu'un vide, qui laisserait croire à une information perdue. */
            <EtiquetteStatut ton="attention">À qualifier</EtiquetteStatut>
          ) : (
            <span className="text-sm text-secondary-900">{gravite}</span>
          )}
        </Case>
      </dl>
    </Card>
  )
}

function Case({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{libelle}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function Vide({ children }: { children: React.ReactNode }) {
  return <span className="text-caption text-muted-foreground">{children}</span>
}
