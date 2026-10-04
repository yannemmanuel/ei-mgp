import Link from 'next/link'
import { FileQuestion, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PageIntrouvablePublique() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary-100 text-secondary-400 mb-6 shadow-xs">
        <FileQuestion className="h-8 w-8" aria-hidden />
      </div>

      <h1 className="text-titre text-secondary-900 font-heading">
        Cette page n&apos;existe pas
      </h1>

      <p className="mt-3 text-sm text-secondary-600 leading-relaxed max-w-sm mx-auto">
        Le lien ou le QR code que vous avez suivi ne mène à rien. Vous pouvez déposer votre
        déclaration depuis le début — rien de ce que vous avez à signaler n&apos;est perdu.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          render={<Link href="/declarer" />}
          className="rounded-xl gap-2 shadow-xs h-10 px-5 font-semibold"
        >
          Faire une déclaration
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          render={<Link href="/suivi" />}
          className="rounded-xl h-10 px-5 border-border/80"
        >
          Suivre un dossier existant
        </Button>
      </div>
    </div>
  )
}
