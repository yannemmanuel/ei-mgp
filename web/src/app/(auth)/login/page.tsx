import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { utilisateurCourant } from '@/server/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormulaireConnexion } from './formulaire-connexion'

export const metadata: Metadata = {
  title: 'Connexion',
}

export default async function PageConnexion() {
  // Comportement Laravel : un utilisateur déjà authentifié est renvoyé au tableau de bord.
  if (await utilisateurCourant()) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-secondary-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
              EI
            </span>
            <span className="text-label uppercase tracking-wide text-secondary-500">
              Digitalisation EI / MGP
            </span>
          </div>
          <CardTitle className="mt-4 font-serif text-h1">Connexion</CardTitle>
          <CardDescription>Mécanisme de Gestion des Plaintes</CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireConnexion />
        </CardContent>
      </Card>
    </main>
  )
}
