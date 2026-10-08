import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

/**
 * Polices reprises de la charte : Instrument Sans pour
 * l'interface, Source Serif 4 réservée aux titres et aux moments « document officiel » du
 * front-office public (accroche, numéro de référence) — jamais sur les libellés de champs ni
 * les tableaux, qui restent en sans pour la lisibilité.
 *
 * Fichiers variables hébergés dans le dépôt (Fontsource, licence OFL, sous-ensemble latin) plutôt
 * que `next/font/google` : celui-ci télécharge les polices AU BUILD, et le moindre échec réseau
 * (proxy, certificat intercepté, serveur sans accès sortant) casse toute la construction.
 */
const instrumentSans = localFont({
  src: './polices/instrument-sans-latin-wght-normal.woff2',
  variable: '--font-instrument-sans',
  weight: '400 700',
  display: 'swap',
})

const sourceSerif = localFont({
  src: './polices/source-serif-4-latin-wght-normal.woff2',
  variable: '--font-source-serif',
  weight: '200 900',
  display: 'swap',
})

export const metadata: Metadata = {
  applicationName: 'EI-MGP',
  title: {
    default: 'EI-MGP',
    template: '%s — EI-MGP',
  },
  description:
    "Mécanisme de Gestion des Plaintes — déclaration et suivi des évènements indésirables et des griefs.",
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#008f4c',
  colorScheme: 'light',
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
        <a
          href="#contenu-principal"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-secondary-900 px-4 py-3 text-sm font-semibold text-white shadow-xl transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
        >
          Aller au contenu principal
        </a>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
