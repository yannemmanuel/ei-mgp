'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Frontière d'erreur du back-office — pannes techniques uniquement.
 *
 * Les refus d'autorisation ne passent PAS par ici : en production, Next.js retire le `name` et
 * le `message` des erreurs serveur avant de les transmettre au client, cette frontière serait
 * donc incapable de distinguer un refus d'une panne. `exigerPermission()` redirige vers
 * /acces-refuse (cf. src/server/auth/session.ts).
 *
 * Aucun détail technique n'est montré : sur une application de signalement, un message bavard
 * peut révéler l'existence d'un dossier ou la structure interne (docs/exigences-securite.md §5).
 */
export default function ErreurApplication({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <TriangleAlert className="mx-auto h-10 w-10 text-accent-500" aria-hidden />
      <h1 className="mt-4 text-h2 text-secondary-900">Une erreur est survenue</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        L&apos;opération n&apos;a pas pu aboutir. Aucune donnée n&apos;a été perdue : vous pouvez
        réessayer.
      </p>
      {error.digest && (
        <p className="mt-2 text-caption text-muted-foreground">Référence technique : {error.digest}</p>
      )}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Tableau de bord
        </Button>
      </div>
    </div>
  )
}
