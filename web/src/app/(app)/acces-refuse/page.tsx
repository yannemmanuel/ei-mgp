import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Accès refusé',
}

/**
 * Équivalent du 403 Laravel. Volontairement sobre et sans détail technique : sur un dispositif
 * de signalement, un message trop bavard peut révéler l'existence d'un dossier ou la structure
 * interne des rôles (docs/exigences-securite.md §5).
 */
export default function PageAccesRefuse() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-secondary-400" aria-hidden />
      <h1 className="mt-4 text-h2 text-secondary-900">Accès refusé</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Votre rôle ne vous autorise pas à consulter cette page. Si vous pensez qu&apos;il s&apos;agit
        d&apos;une erreur, contactez le Service MGP.
      </p>
      <Button className="mt-6" render={<Link href="/dashboard" />}>
        Retour au tableau de bord
      </Button>
    </div>
  )
}
