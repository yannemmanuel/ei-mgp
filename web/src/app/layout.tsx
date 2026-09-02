import type { Metadata } from 'next'
import { Instrument_Sans, Source_Serif_4 } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

/**
 * Polices reprises de l'application Laravel (resources/css/app.css) : Instrument Sans pour
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="fr"
      className={`${instrumentSans.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
