import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

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

      <Alert className="mt-6">
        <AlertDescription>
          <strong className="font-medium">Conservez ces deux informations.</strong> Elles sont la
          seule façon de consulter votre dossier. Le code d’accès ne peut pas vous être renvoyé :
          il n’est conservé que sous forme chiffrée.
        </AlertDescription>
      </Alert>

      <p className="mt-6 text-sm">
        <Link href="/suivi" className="text-primary-700 underline underline-offset-2">
          Suivre mon dossier
        </Link>
      </p>
    </div>
  )
}
