'use client'

import Image from 'next/image'
import { useActionState, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EtatFormulaire } from '../editeur-referentiel'
import { BoutonSupprimer } from '../bouton-supprimer'
import { actionSupprimerQrCode } from '../suppressions-actions'
import {
  actionBasculerQrCode,
  actionGenererQrCode,
  actionModifierUrlCible,
} from './actions'

export type QrCodeVue = {
  id: string
  token: string
  urlCible: string
  actif: boolean
  parcours: string
  genereLe: string
  genererPar: string
  svg: string
}

const ETAT: EtatFormulaire = {}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso))

export function PanneauQrCodes({
  qrCodes,
  parcours,
}: {
  qrCodes: QrCodeVue[]
  parcours: { id: string; libelle: string }[]
}) {
  const [etatGeneration, generer, generationEnCours] = useActionState(actionGenererQrCode, ETAT)

  return (
    <div className="space-y-6">
      <div>
        <EnTetePage
          titre="QR codes"
          lede="Tous les codes mènent au même écran, où le déclarant choisit lui-même. Un seul support à imprimer."
          mailles={[
            { libelle: 'Administration', href: '/administration' },
            { libelle: 'QR codes' },
          ]}
        />
        <p className="mt-2 text-caption text-muted-foreground">
          Un code peut être retiré de la circulation même une fois imprimé.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Générer un support</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={generer} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <Label htmlFor="parcoursId" className="text-caption text-muted-foreground">
                Parcours de rattachement (documentaire)
              </Label>
              <select
                id="parcoursId"
                name="parcoursId"
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— Sélectionner —</option>
                {parcours.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.libelle}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" disabled={generationEnCours}>
              {generationEnCours ? 'Génération…' : 'Générer'}
            </Button>
          </form>

          {etatGeneration.erreur && (
            <Alert variant="destructive" role="alert" className="mt-3">
              <AlertDescription>{etatGeneration.erreur}</AlertDescription>
            </Alert>
          )}
          {etatGeneration.succes && (
            <Alert className="mt-3">
              <AlertDescription>{etatGeneration.succes}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {qrCodes.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Aucun QR code généré.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map((code) => (
            <FicheQrCode key={code.id} code={code} />
          ))}
        </div>
      )}
    </div>
  )
}

function FicheQrCode({ code }: { code: QrCodeVue }) {
  const [ouvert, setOuvert] = useState(false)
  const [etatUrl, enregistrerUrl, urlEnCours] = useActionState(actionModifierUrlCible, ETAT)
  const [etatBascule, basculer, basculeEnCours] = useActionState(actionBasculerQrCode, ETAT)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-secondary-900">{code.parcours}</p>
          <p className="text-caption text-muted-foreground">
            Généré le {dateFr(code.genereLe)} par {code.genererPar}
          </p>
        </div>
        <Badge variant={code.actif ? 'default' : 'secondary'}>
          {code.actif ? 'Actif' : 'Retiré'}
        </Badge>
      </div>

      <div className="mt-3 flex justify-center rounded-md border border-border bg-white p-3">
        <Image src={code.svg} alt={`QR code ${code.parcours}`} width={140} height={140} unoptimized />
      </div>

      <p className="mt-2 break-all font-mono text-caption text-muted-foreground">{code.token}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={basculer}>
          <input type="hidden" name="qrCodeId" value={code.id} />
          <Button
            type="submit"
            size="sm"
            variant={code.actif ? 'outline' : 'default'}
            disabled={basculeEnCours}
          >
            {code.actif ? 'Retirer de la circulation' : 'Remettre en circulation'}
          </Button>
        </form>

        <Button size="sm" variant="ghost" onClick={() => setOuvert((v) => !v)}>
          URL cible
        </Button>

        {/*
          ⚠️ « Retirer de la circulation » suffit presque toujours, et vaut mieux.

          Les deux se comportent pareil pour qui scanne l'affiche. Mais un code retiré reste
          identifiable dans le journal et se remet en circulation si l'affiche est encore au mur ;
          un code supprimé ne revient pas.
        */}
        <BoutonSupprimer id={code.id} nom={code.token} action={actionSupprimerQrCode} />
      </div>

      {(etatBascule.erreur || etatUrl.erreur) && (
        <Alert variant="destructive" role="alert" className="mt-3">
          <AlertDescription>{etatBascule.erreur ?? etatUrl.erreur}</AlertDescription>
        </Alert>
      )}

      {ouvert && (
        <form action={enregistrerUrl} className="mt-3 space-y-2 border-t border-border pt-3">
          <input type="hidden" name="qrCodeId" value={code.id} />

          <Label htmlFor={`url-${code.id}`} className="text-caption text-muted-foreground">
            URL cible
          </Label>
          <Input id={`url-${code.id}`} name="urlCible" defaultValue={code.urlCible} />

          {/* Voir MIGRATION_PLAN.md : la baisse de confiance vient de la baseline, où cet écran
              laisse croire à une réorientation qui n'a jamais lieu. */}
          <p className="text-caption text-muted-foreground">
            Valeur documentaire : la redirection mène toujours à l’écran de choix, cette adresse
            n’est lue par aucun traitement.
          </p>

          <Button type="submit" size="sm" disabled={urlEnCours}>
            {urlEnCours ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      )}
    </Card>
  )
}
