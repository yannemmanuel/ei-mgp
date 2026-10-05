'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErreurPublique({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      {/*
        ⚠️ L'ORANGE DE LA PALETTE, pas `amber-*` de Tailwind. L'échelle Accent du projet EST
        l'accent d'alerte secondaire (`globals.css`), et son commentaire dit pourquoi les
        couleurs sémantiques sont distinctes de la marque : elles encodent une information
        métier. Une teinte prise ailleurs ne suit pas l'identité si celle-ci évolue, et personne
        ne s'en aperçoit avant que deux écrans n'affichent deux oranges différents.
      */}
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
        <TriangleAlert className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="text-titre text-secondary-900 font-heading">
        Votre action n&apos;a pas pu être terminée
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        La page n&apos;a pas pu être chargée. Réessayez une fois. Si le problème persiste, revenez
        à l&apos;étape précédente pour vérifier vos informations avant de continuer.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs font-mono text-muted-foreground">Référence technique : {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={retry} className="rounded-xl shadow-xs">
          <RotateCcw aria-hidden />
          Réessayer
        </Button>
        <Button variant="outline" onClick={() => router.back()} className="rounded-xl">
          <ArrowLeft aria-hidden />
          Revenir à l&apos;étape précédente
        </Button>
        {/*
          ⚠️ `/declarer`, JAMAIS `/`. La racine n'est pas un accueil : c'est un aiguillage
          personnel — `/dashboard` si l'on est connecté, `/login` sinon. Or personne ne l'est ici.
          Y renvoyer un déclarant l'expédie vers la connexion du PERSONNEL, où il n'a pas de
          compte et n'en aura jamais.

          Le défaut avait déjà été corrigé pour le lien de marque de `(public)/layout.tsx`, qui
          en porte le commentaire, et pour `(public)/not-found.tsx`. C'est sa troisième
          apparition : la racine ATTIRE, parce qu'elle ressemble à un accueil.
        */}
        <Button variant="ghost" render={<Link href="/declarer" />} className="rounded-xl">
          Recommencer ma déclaration
        </Button>
      </div>
    </div>
  )
}
