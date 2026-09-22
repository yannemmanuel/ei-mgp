import type { Metadata } from 'next'
import { Instrument_Sans, Source_Serif_4 } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

/**
 * Polices reprises de la charte : Instrument Sans pour
 * l'interface, Source Serif 4 réservée aux titres et aux moments « document officiel » du
 * front-office public (accroche, numéro de référence) — jamais sur les libellés de champs ni
 * les tableaux, qui restent en sans pour la lisibilité.
 */
const instrumentSans = Instrument_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  variable: '--font-serif',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'EI-MGP',
    template: '%s — EI-MGP',
  },
  description:
    "Mécanisme de Gestion des Plaintes — déclaration et suivi des évènements indésirables et des griefs.",
}

/**
 * `suppressHydrationWarning` sur `<html>` et `<body>` UNIQUEMENT.
 *
 * Les extensions de navigateur écrivent leurs propres attributs sur ces deux éléments avant que
 * React ne s'exécute — `data-lt-installed` (LanguageTool), `inmaintabuse`, et d'autres. React les
 * voit comme un écart entre le HTML servi et l'arbre attendu, et signale une erreur d'hydratation
 * que rien dans l'application ne peut corriger.
 *
 * Cette suppression ne porte QUE sur les attributs de ces deux balises, sur un seul niveau : une
 * vraie divergence dans le contenu de la page continue d'être signalée. C'est le remède
 * documenté par React pour ce cas précis, et il ne masque rien d'autre.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="fr"
      className={`${instrumentSans.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
