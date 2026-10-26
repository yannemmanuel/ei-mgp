import Link from 'next/link'
import { CheckCircle2, Plus, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
      <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
      <h1 className="mt-4 font-serif text-h1 text-secondary-900">Déclaration enregistrée</h1>
      <p className="mt-2 text-sm text-secondary-600">
        Votre déclaration a bien été reçue et va être prise en charge.
      </p>

      <div className="mt-8 rounded-lg border border-border p-6">
        <dl className="space-y-5">
          <div>
            <dt className="text-label uppercase tracking-wide text-secondary-500">
              Numéro de référence
            </dt>
            <dd className="mt-1 font-serif text-h1 tracking-tight text-secondary-900">{reference}</dd>
          </div>
          <div>
            <dt className="text-label uppercase tracking-wide text-secondary-500">Code d’accès</dt>
            <dd className="mt-1 font-mono text-h1 tracking-widest text-secondary-900">{codeAcces}</dd>
          </div>
        </dl>
      </div>

      <Alert className="mt-6 border-red-200 bg-red-50 text-red-900">
        <TriangleAlert aria-hidden />
        <AlertTitle>À conserver impérativement</AlertTitle>
        <AlertDescription className="text-red-800">
          Notez votre numéro de référence et votre code d’accès. Ils sont indispensables pour
          consulter votre dossier et le code ne pourra pas vous être renvoyé.
        </AlertDescription>
      </Alert>

      <p className="mt-6 text-sm">
        <Link href="/suivi" className="text-primary-700 underline underline-offset-2">
          Suivre mon dossier
        </Link>
      </p>

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
