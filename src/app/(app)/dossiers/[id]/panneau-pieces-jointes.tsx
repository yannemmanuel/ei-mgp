'use client'

import { useState } from 'react'
import { Download, ExternalLink, Eye, FileText, Image as ImageIcon, LoaderCircle, Paperclip, Video } from 'lucide-react'
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
  const [chargement, setChargement] = useState(false)
  const [erreurApercu, setErreurApercu] = useState(false)

  const basculerApercu = (id: string) => {
    const ouvrir = ouverte !== id
    setOuverte(ouvrir ? id : null)
    setChargement(ouvrir)
    setErreurApercu(false)
  }

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
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-h3">Pièces jointes</CardTitle>
          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
            {pieces.length} fichier{pieces.length > 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {pieces.map((piece) => {
            const format = formatApercu(piece.mimeType)
            const estOuverte = ouverte === piece.id
            const idRegion = `apercu-${piece.id}`

            return (
              <li key={piece.id} className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-xs transition-shadow hover:shadow-sm">
                <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                    {format === 'image' ? <ImageIcon className="h-5 w-5" aria-hidden /> : format === 'video' ? <Video className="h-5 w-5" aria-hidden /> : piece.mimeType === 'application/pdf' ? <FileText className="h-5 w-5" aria-hidden /> : <Paperclip className="h-5 w-5" aria-hidden />}
                  </span>

                  {/*
                    Le nom déclenche l'aperçu quand la pièce est affichable — c'est l'intention la
                    plus fréquente, et celle qui était impossible jusqu'ici. Le téléchargement
                    reste offert à côté, explicitement. Pour un type non affichable, le nom reprend
                    son rôle de lien de téléchargement : pas de bouton qui n'ouvrirait rien.
                  */}
                  {format ? (
                    <button
                      type="button"
                      onClick={() => basculerApercu(piece.id)}
                      aria-expanded={estOuverte}
                      aria-controls={idRegion}
                      className="min-w-[12rem] flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-secondary-900">{piece.nomOriginal}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{piece.mimeType} · {poidsLisible(piece.tailleOctets)}</span>
                    </button>
                  ) : (
                    <a
                      href={urlTelechargement(piece.id)}
                      download={piece.nomOriginal}
                      className="min-w-[12rem] flex-1"
                    >
                      <span className="block truncate text-sm font-semibold text-secondary-900">{piece.nomOriginal}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{piece.mimeType} · {poidsLisible(piece.tailleOctets)}</span>
                    </a>
                  )}

                  {format && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => basculerApercu(piece.id)}
                      aria-expanded={estOuverte}
                      aria-controls={idRegion}
                      className="shrink-0 gap-1.5"
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                      {estOuverte ? 'Fermer' : 'Aperçu'}
                    </Button>
                  )}

                  <a
                    href={urlTelechargement(piece.id)}
                    download={piece.nomOriginal}
                    aria-label={`Télécharger ${piece.nomOriginal}`}
                    title="Télécharger"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-secondary-500 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                </div>

                {format && estOuverte && (
                  <div id={idRegion} className="border-t border-border bg-secondary-50/50 p-3 sm:p-4">
                    <div className="relative min-h-40">
                      {chargement && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/90" role="status">
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-secondary-700">
                            <LoaderCircle className="h-5 w-5 animate-spin text-primary-700" aria-hidden />
                            Chargement de l’aperçu…
                          </span>
                        </div>
                      )}
                      {erreurApercu ? (
                        <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">
                          L’aperçu n’a pas pu être chargé. Utilisez le téléchargement ou ouvrez le fichier dans un nouvel onglet.
                        </div>
                      ) : (
                        <Apercu
                          format={format}
                          url={urlApercu(piece.id)}
                          nom={piece.nomOriginal}
                          mimeType={piece.mimeType}
                          onCharge={() => setChargement(false)}
                          onErreur={() => { setChargement(false); setErreurApercu(true) }}
                        />
                      )}
                    </div>
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
  onCharge,
  onErreur,
}: {
  format: FormatApercu
  url: string
  nom: string
  mimeType: string
  onCharge: () => void
  onErreur: () => void
}) {
  const cadre = 'w-full rounded-md border border-border bg-secondary-50'

  if (format === 'image') {
    /* eslint-disable-next-line @next/next/no-img-element --
       `next/image` optimise en amont via son propre service, à partir d'une URL qu'il doit
       pouvoir refetcher. Ces pièces sont privées, servies en `no-store` derrière un contrôle
       d'accès par dossier : elles n'ont rien à faire dans un cache d'images partagé. */
    return <img src={url} alt={`Aperçu de ${nom}`} onLoad={onCharge} onError={onErreur} className={`${cadre} max-h-[60vh] object-contain`} />
  }

  if (format === 'video') {
    return (
      <video controls preload="metadata" onLoadedMetadata={onCharge} onError={onErreur} className={`${cadre} max-h-[60vh]`}>
        <source src={url} type={mimeType} />
        Votre navigateur ne sait pas lire cette vidéo — ouvrez-la dans un nouvel onglet.
      </video>
    )
  }

  return <iframe src={url} title={`Aperçu de ${nom}`} onLoad={onCharge} onError={onErreur} className={`${cadre} h-[70vh]`} />
}
