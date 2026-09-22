'use client'

import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EtiquetteStatut } from '@/components/ui/etiquette-statut'
import { actionModifierTypesQualifiants, type EtatFamilles } from './actions'

export type TypeVue = {
  code: string
  libelle: string
  actif: boolean
  qualifieLaFamille: boolean
  dossiersQualifies: number
  /** Familles que CE type propose réellement : les siennes, plus celles de « tous les types ». */
  famillesProposees: number
}

const ETAT: EtatFamilles = {}

/**
 * Où la famille de risque est DEMANDÉE — type de déclaration par type de déclaration.
 *
 * ⚠️ CE PANNEAU EST NÉ D'UN RETRAIT. Le métier a demandé de retirer les familles de risque des
 * évènements indésirables, « mais en laissant une possibilité de paramétrage dans le back-office ».
 * La décision se coche donc ici plutôt que de vivre dans le code, où la défaire aurait demandé un
 * déploiement.
 */
export function PanneauTypes({ types }: { types: TypeVue[] }) {
  const [etat, envoyer, enCours] = useActionState(actionModifierTypesQualifiants, ETAT)
  const [coches, setCoches] = useState<string[]>(() =>
    types.filter((t) => t.qualifieLaFamille).map((t) => t.code)
  )

  function basculer(code: string, actif: boolean) {
    setCoches((actuels) =>
      actif ? [...new Set([...actuels, code])] : actuels.filter((c) => c !== code)
    )
  }

  /*
    Ce qu'un décochage laisserait derrière lui — annoncé AVANT l'enregistrement.

    Décocher n'efface rien : les dossiers déjà qualifiés gardent leur famille et continuent de
    l'afficher. C'est rassurant, et c'est précisément ce qu'on ne devine pas : sans cette ligne, on
    hésite à décocher de peur de perdre la donnée, ou on décoche en croyant l'effacer.
  */
  const conserves = types
    .filter((t) => t.qualifieLaFamille && !coches.includes(t.code) && t.dossiersQualifies > 0)
    .reduce((somme, t) => somme + t.dossiersQualifies, 0)

  /*
    Les types qu'on s'apprête à cocher — ou qui le sont déjà — sans qu'aucune famille ne leur soit
    proposée. Calculé sur les cases TELLES QU'ELLES SONT À L'ÉCRAN, donc l'avertissement apparaît
    au moment où l'on coche, et non après l'enregistrement.
  */
  const typesSansFamille = types.filter(
    (t) => coches.includes(t.code) && t.famillesProposees === 0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Où la famille est demandée</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={envoyer} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sur les types cochés, les traitants qualifient une famille de risque depuis la fiche du
            dossier. Sur les autres, la carte n’apparaît pas.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {types.map((type) => {
              const id = `type-${type.code}`
              const actif = coches.includes(type.code)

              return (
                <label
                  key={type.code}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/40"
                >
                  <input
                    id={id}
                    name="types"
                    type="checkbox"
                    value={type.code}
                    checked={actif}
                    onChange={(evenement) => basculer(type.code, evenement.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary-700"
                  />
                  <span className="min-w-0 text-sm text-secondary-900">
                    <span className="flex flex-wrap items-center gap-2">
                      {type.libelle}
                      {!type.actif && (
                        <EtiquetteStatut ton="alerte">Type désactivé</EtiquetteStatut>
                      )}
                    </span>
                    <span className="mt-1 block text-caption text-muted-foreground">
                      {/*
                        ⚠️ CE QUE CE TYPE PROPOSE, en premier. Depuis que les familles sont
                        rattachées, un type peut être coché et n'avoir AUCUNE famille à offrir —
                        le traitant voit alors une carte vide, sans message. C'est le chiffre qui
                        rend cette situation visible ici, ligne par ligne.
                      */}
                      {type.famillesProposees === 0
                        ? 'Aucune famille ne lui est proposée.'
                        : `${type.famillesProposees} famille${type.famillesProposees > 1 ? 's' : ''} proposée${type.famillesProposees > 1 ? 's' : ''}.`}{' '}
                      {type.dossiersQualifies === 0
                        ? 'Aucun dossier n’en porte pour l’instant.'
                        : `${type.dossiersQualifies} dossier${type.dossiersQualifies > 1 ? 's' : ''} en porte${type.dossiersQualifies > 1 ? 'nt' : ''} déjà une.`}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          {conserves > 0 && (
            <Alert role="status">
              <AlertDescription>
                {conserves} dossier{conserves > 1 ? 's' : ''} porte{conserves > 1 ? 'nt' : ''} déjà
                une famille sur un type que vous décochez.{' '}
                {conserves > 1 ? 'Ils la gardent' : 'Il la garde'} : décocher retire la question des
                fiches à venir, sans rien effacer.
              </AlertDescription>
            </Alert>
          )}

          {/*
            ⚠️ LA PANNE SILENCIEUSE que ce couple de réglages peut produire : un type qui demande
            une famille alors qu'aucune ne lui est proposée. Le traitant voit une liste vide — ou
            rien du tout —, et l'administrateur voit la case cochée.

            ⚠️ TYPE PAR TYPE depuis le rattachement (2026-09-22). Le contrôle portait sur le total
            des familles actives : il se taisait dès qu'il en restait UNE, même réservée à un autre
            type. Un grief communautaire coché pouvait donc n'avoir rien à offrir sans que rien ne
            le dise — exactement la situation que ce bloc existe pour attraper.
          */}
          {typesSansFamille.length > 0 && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {typesSansFamille.length === 1
                  ? `« ${typesSansFamille[0].libelle} » demande une famille de risque, mais aucune ne lui est proposée : ses traitants n’auraient rien à choisir.`
                  : `Ces types demandent une famille sans qu’aucune ne leur soit proposée : ${typesSansFamille.map((t) => t.libelle).join(', ')}.`}{' '}
                Ajoutez-en une ci-dessus, en la réservant au type ou en la laissant sur « Tous les
                types ».
              </AlertDescription>
            </Alert>
          )}

          {coches.length === 0 && (
            <Alert role="status">
              <AlertDescription>
                Aucun type coché : plus personne ne qualifiera de famille, et la répartition
                disparaîtra du tableau de bord.
              </AlertDescription>
            </Alert>
          )}

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

          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
