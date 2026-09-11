'use client'

import { useState } from 'react'
import { Download, ExternalLink, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatApercu, type FormatApercu } from '@/lib/apercu-pieces-jointes'

export type PieceJointeVue = {
  id: string
  nomOriginal: string
  mimeType: string
  tailleOctets: number
}

type Props = { pieces: PieceJointeVue[] }

/**
 * Deux URL pour une même pièce, et une seule route.
 *
 * `?apercu=1` ne change que les en-têtes de la réponse (`inline` au lieu de `attachment`, plus
 * l'isolation) : les mêmes contrôles d'accès s'appliquent aux deux. Rien n'est jamais servi
 * depuis une URL de stockage directe (`docs/exigences-securite.md` §3).
 */
const urlTelechargement = (id: string) => `/api/pieces-jointes/${id}`
const urlApercu = (id: string) => `/api/pieces-jointes/${id}?apercu=1`

const poidsLisible = (octets: number) =>
  octets >= 1024 * 1024
    ? `${(octets / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} Ko`

export function PanneauPiecesJointes({ pieces }: Props) {
  /*
   * Une seule pièce ouverte à la fois, et aucune au chargement.
   *
   * L'aperçu se charge à la demande plutôt qu'en vignettes affichées d'emblée : une déclaration
   * peut porter 50 Mo de photos, et la fiche est consultée depuis le terrain, souvent en réseau
   * mobile. Afficher des vignettes reviendrait à télécharger tout le lot pour n'en regarder
   * parfois aucune — exactement ce que la demande cherche à éviter.
   */
  const [ouverte, setOuverte] = useState<string | null>(null)

  if (pieces.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Pièces jointes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Pièces jointes</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {pieces.map((piece) => {
            const format = formatApercu(piece.mimeType)
            const estOuverte = ouverte === piece.id
            const idRegion = `apercu-${piece.id}`

            return (
              <li key={piece.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Paperclip className="h-4 w-4 shrink-0 text-secondary-400" aria-hidden />

                  {/*
                    Le nom déclenche l'aperçu quand la pièce est affichable — c'est l'intention la
                    plus fréquente, et celle qui était impossible jusqu'ici. Le téléchargement
                    reste offert à côté, explicitement. Pour un type non affichable, le nom reprend
                    son rôle de lien de téléchargement : pas de bouton qui n'ouvrirait rien.
                  */}
                  {format ? (
                    <button
                      type="button"
                      onClick={() => setOuverte(estOuverte ? null : piece.id)}
                      aria-expanded={estOuverte}
                      aria-controls={idRegion}
                      className="min-w-0 flex-1 truncate text-left text-sm text-secondary-800 underline-offset-2 hover:text-primary-700 hover:underline"
                    >
                      {piece.nomOriginal}
                    </button>
                  ) : (
                    <a
                      href={urlTelechargement(piece.id)}
                      download={piece.nomOriginal}
                      className="min-w-0 flex-1 truncate text-sm text-secondary-800 underline-offset-2 hover:text-primary-700 hover:underline"
                    >
                      {piece.nomOriginal}
                    </a>
                  )}

                  <span className="shrink-0 text-caption text-muted-foreground">
                    {poidsLisible(piece.tailleOctets)}
                  </span>

                  {format && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOuverte(estOuverte ? null : piece.id)}
                      aria-expanded={estOuverte}
                      aria-controls={idRegion}
                      className="shrink-0"
                    >
                      {estOuverte ? 'Masquer' : 'Aperçu'}
                    </Button>
                  )}

                  <a
                    href={urlTelechargement(piece.id)}
                    download={piece.nomOriginal}
                    aria-label={`Télécharger ${piece.nomOriginal}`}
                    title="Télécharger"
                    className="shrink-0 rounded-md p-1.5 text-secondary-500 hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                </div>

                {format && estOuverte && (
                  <div id={idRegion} className="mt-3">
                    <Apercu
                      format={format}
                      url={urlApercu(piece.id)}
                      nom={piece.nomOriginal}
                      mimeType={piece.mimeType}
                    />
                    {/*
                      Le plein écran n'est pas un ornement : il confie le rendu au visualiseur du
                      navigateur, hors de tout cadre. C'est le recours si un format se prête mal à
                      l'affichage intégré — un .mov, que tous les navigateurs ne lisent pas.
                    */}
                    <a
                      href={urlApercu(piece.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-caption text-secondary-600 underline-offset-2 hover:text-primary-700 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Ouvrir dans un nouvel onglet
                    </a>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function Apercu({
  format,
  url,
  nom,
  mimeType,
}: {
  format: FormatApercu
  url: string
  nom: string
  mimeType: string
}) {
  const cadre = 'w-full rounded-md border border-border bg-secondary-50'

  if (format === 'image') {
    /* eslint-disable-next-line @next/next/no-img-element --
       `next/image` optimise en amont via son propre service, à partir d'une URL qu'il doit
       pouvoir refetcher. Ces pièces sont privées, servies en `no-store` derrière un contrôle
       d'accès par dossier : elles n'ont rien à faire dans un cache d'images partagé. */
    return <img src={url} alt={`Aperçu de ${nom}`} className={`${cadre} max-h-[60vh] object-contain`} />
  }

  if (format === 'video') {
    return (
      <video controls preload="metadata" className={`${cadre} max-h-[60vh]`}>
        <source src={url} type={mimeType} />
        Votre navigateur ne sait pas lire cette vidéo — ouvrez-la dans un nouvel onglet.
      </video>
    )
  }

  return <iframe src={url} title={`Aperçu de ${nom}`} className={`${cadre} h-[70vh]`} />
}
