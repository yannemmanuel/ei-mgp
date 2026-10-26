import Link from 'next/link'
import { CheckCircle2, Plus, Search, TriangleAlert } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Récépissé de déclaration (EX-DEC-08).
 *
 * Point culminant du parcours déclarant : c'est le seul moment où le code d'accès est affiché
 * en clair — il n'est stocké que haché (RG-02) et ne pourra JAMAIS être réaffiché ni renvoyé.
 * D'où la mise en avant typographique et l'avertissement explicite.
 */
export function Recepisse({ reference, codeAcces }: { reference: string; codeAcces: string }) {
  return (
    <div className="mx-auto max-w-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50">
        <CheckCircle2 className="size-7 text-primary-700" aria-hidden />
      </div>
      <h1 className="mt-4 font-serif text-h1 text-secondary-900">Déclaration enregistrée</h1>
      <p className="mt-2 text-sm leading-6 text-secondary-600">
        Votre déclaration a bien été reçue. Conservez les informations ci-dessous pour consulter
        son avancement.
      </p>

      <section
        aria-labelledby="identifiants-suivi"
        className="mt-7 overflow-hidden rounded-xl bg-red-700 text-white shadow-sm"
      >
        <div className="flex items-start gap-3 border-b border-white/20 px-5 py-4 sm:px-6">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <h2 id="identifiants-suivi" className="font-semibold">
              À conserver impérativement
            </h2>
            <p className="mt-1 text-sm leading-5 text-red-50">
              Ces deux informations sont nécessaires pour retrouver votre dossier.
            </p>
          </div>
        </div>

        <dl className="grid gap-px bg-white/20 sm:grid-cols-2">
          <div className="min-w-0 bg-red-700 px-5 py-5 sm:px-6">
            <dt className="text-xs font-semibold uppercase tracking-wider text-red-100">
              Numéro de référence
            </dt>
            <dd className="mt-2 select-all break-words font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {reference}
            </dd>
          </div>
          <div className="min-w-0 bg-red-700 px-5 py-5 sm:px-6">
            <dt className="text-xs font-semibold uppercase tracking-wider text-red-100">
              Code d’accès
            </dt>
            <dd className="mt-2 select-all break-all font-mono text-2xl font-bold tracking-[0.14em] sm:text-3xl">
              {codeAcces}
            </dd>
          </div>
        </dl>

        <p className="border-t border-white/20 px-5 py-3 text-xs leading-5 text-red-50 sm:px-6">
          Prenez une capture d’écran ou notez-les maintenant : le code ne pourra pas être affiché
          une seconde fois.
        </p>
      </section>

      <Link
        href="/suivi"
        className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full sm:w-auto')}
      >
        <Search className="size-4" aria-hidden />
        Suivre mon dossier
      </Link>

      <AutreDeclaration />
    </div>
  )
}

/**
 * Repartir sur une nouvelle déclaration, sans perdre la précédente par mégarde.
 *
 * ⚠️ Quitter cet écran efface définitivement le code d'accès : il n'est conservé que haché
 * (RG-02) et ne pourra jamais être réaffiché ni renvoyé. Un lien direct, à portée de pouce sous
 * la référence, aurait donc suffi à priver un déclarant du seul moyen de suivre son dossier — et
 * l'avertissement juste au-dessus n'y aurait rien changé, personne ne lisant deux fois la même
 * mise en garde.
 *
 * D'où le repli : on déclare l'intention, puis on la confirme. C'est le geste que l'application
 * demande déjà pour désactiver un rôle ou un compte, pour la même raison — ce qui ne se rattrape
 * pas se confirme.
 *
 * `<details>` plutôt qu'un état React : cet écran reste un composant serveur, et le repli
 * fonctionne sans JavaScript. Le formulaire public est consulté sur des téléphones et des
 * connexions dont on ne présume rien.
 */
function AutreDeclaration() {
  return (
    <details className="mt-8 border-t border-border pt-6">
      <summary
        className={cn(
          buttonVariants({ variant: 'outline' }),
          // `list-none` et le sélecteur WebKit retirent le triangle par défaut du `<summary>` :
          // sans eux, le bouton porterait une flèche que rien d'autre dans l'application n'a.
          'cursor-pointer list-none [&::-webkit-details-marker]:hidden'
        )}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Faire une autre déclaration
      </summary>

      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <div className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            Avez-vous noté votre numéro de référence et votre code d’accès ? Ils ne seront plus
            affichés après cette page.
          </p>
        </div>

        <Button className="mt-3" render={<Link href="/declarer" />}>
          Oui, faire une autre déclaration
        </Button>
      </div>
    </details>
  )
}
