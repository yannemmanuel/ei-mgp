import Link from 'next/link'

/**
 * Coquille du front-office public (déclaration, suivi).
 *
 * Le panneau de contexte est la bonne direction déjà posée côté Laravel
 * (`layouts/guest.blade.php`) : accroche en serif, réassurance, étapes. Il reste visible en
 * permanence sur grand écran — la réassurance doit être constante pour un déclarant qui peut
 * être en situation de méfiance (docs/visual-direction.md).
 */
const ETAPES = [
  { titre: 'Décrivez les faits', description: 'Lieu, date, ce qui s’est passé.' },
  { titre: 'Recevez une référence', description: 'Un numéro de dossier vous est remis immédiatement.' },
  { titre: 'Suivez l’avancement', description: 'Consultez l’état de votre dossier à tout moment.' },
]

export default function LayoutPublic({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="bg-gradient-to-b from-white to-secondary-50 px-6 py-8 lg:w-96 lg:shrink-0 lg:px-10 lg:py-12">
        {/*
          `/declarer` et non `/`.

          `/` n'est pas un accueil : c'est un aiguillage personnel — `/dashboard` si l'on est
          connecté, `/login` sinon. Or personne ne l'est ici : ce gabarit sert le front-office
          public, dont le déclarant est par construction un visiteur anonyme. Cliquer la marque
          en cours de déclaration le renvoyait donc à la connexion du PERSONNEL, page qui ne le
          concerne pas et qui lui fait perdre sa saisie.

          `/declarer` est le point d'entrée unique de la déclaration (EX-DEC-01/02) : c'est
          l'accueil de qui se trouve ici.
        */}
        <Link href="/declarer" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            EI
          </span>
          <span className="text-label uppercase tracking-wide text-secondary-500">
            Digitalisation EI / MGP
          </span>
        </Link>

        <h2 className="mt-8 font-serif text-h1 text-secondary-900">
          Votre signalement compte.
        </h2>
        <p className="mt-3 text-sm text-secondary-600">
          Chaque déclaration est enregistrée, suivie et traitée. Vous pouvez la déposer de manière
          totalement anonyme.
        </p>

        <ol className="mt-8 space-y-4">
          {ETAPES.map((etape, index) => (
            <li key={etape.titre} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-caption text-primary-800">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium text-secondary-900">{etape.titre}</span>
                <span className="block text-caption text-secondary-500">{etape.description}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-caption text-secondary-500">
          Vous avez déjà déclaré ?{' '}
          <Link href="/suivi" className="text-primary-700 underline underline-offset-2">
            Suivre mon dossier
          </Link>
        </p>
      </aside>

      <main className="flex-1 bg-background px-4 py-8 lg:px-10 lg:py-12">{children}</main>
    </div>
  )
}
