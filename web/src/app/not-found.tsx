import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PageIntrouvable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="max-w-md text-center">
        <FileQuestion className="mx-auto h-10 w-10 text-secondary-400" aria-hidden />
        <h1 className="mt-4 text-h2 text-secondary-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette adresse ne correspond à aucune page. Le dossier recherché a peut-être été
          déplacé, ou vous n&apos;y avez pas accès.
        </p>
        <Button className="mt-6" render={<Link href="/dashboard" />}>
          Retour au tableau de bord
        </Button>
      </div>
    </main>
  )
}
