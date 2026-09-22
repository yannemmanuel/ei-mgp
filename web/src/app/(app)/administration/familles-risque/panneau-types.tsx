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
export function PanneauTypes({
  types,
  famillesActives,
}: {
  types: TypeVue[]
  /** Combien de familles sont proposables — cocher un type sans aucune ne montre rien. */
  famillesActives: number
}) {
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
                      {type.dossiersQualifies === 0
                        ? 'Aucun dossier de ce type n’en porte pour l’instant.'
                        : `${type.dossiersQualifies} dossier${type.dossiersQualifies > 1 ? 's' : ''} de ce type en porte${type.dossiersQualifies > 1 ? 'nt' : ''} déjà une.`}
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
            une famille alors qu'aucune n'est proposée. Le traitant voit une liste vide — ou rien
            du tout —, et l'administrateur voit la case cochée. Le service refuse de retirer la
            dernière famille ; ici, c'est l'autre bout du problème qu'on annonce.
          */}
          {coches.length > 0 && famillesActives === 0 && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                Aucune famille n’est proposée pour l’instant : ces types demanderaient une
                qualification sans rien à choisir. Ajoutez ou réactivez une famille ci-dessus.
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
