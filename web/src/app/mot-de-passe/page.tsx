import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { exigerUtilisateur } from '@/server/auth'
import { LONGUEUR_MINIMALE, OCTETS_MAXIMUM } from '@/server/auth/mot-de-passe'
import { seDeconnecter } from '../(app)/actions'
import { FormulaireMotDePasse } from './formulaire'

export const metadata: Metadata = { title: 'Mot de passe' }
export const dynamic = 'force-dynamic'

/**
 * Changement de mot de passe, volontaire ou imposé.
 *
 * ⚠️ Cette route vit HORS du groupe `(app)`, et ce n'est pas un détail de rangement : la coquille
 * du back-office redirige vers ici tout compte dont le mot de passe a été fixé par un tiers. Si
 * l'écran vivait sous cette coquille, il se redirigerait vers lui-même — boucle infinie, et un
 * compte définitivement inaccessible.
 *
 * Une seule issue est laissée à qui n'a pas encore changé : la déconnexion. Proposer « retour au
 * tableau de bord » rendrait l'obligation contournable d'un clic.
 */
export default async function PageMotDePasse() {
  const utilisateur = await exigerUtilisateur()
  const obligatoire = utilisateur.doitChangerMotDePasse

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-16">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100">
          <KeyRound className="h-5 w-5 text-primary-700" aria-hidden />
        </span>
        <h1 className="text-h1 text-secondary-900">
          {obligatoire ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}
        </h1>
      </div>

      {obligatoire && (
        <Alert className="mt-6">
          <AlertDescription>
            <p className="font-medium">Votre mot de passe a été créé par un administrateur.</p>
            <p className="mt-1 text-caption">
              D’autres personnes le connaissent. Choisissez-en un que vous seul connaissez.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card className="mt-6">
        <CardContent className="p-6">
          <FormulaireMotDePasse
            longueurMinimale={LONGUEUR_MINIMALE}
            octetsMaximum={OCTETS_MAXIMUM}
          />
        </CardContent>
      </Card>

      <div className="mt-6 text-caption text-muted-foreground">
        {obligatoire ? (
          <form action={seDeconnecter}>
            <button type="submit" className="underline underline-offset-2 hover:text-secondary-900">
              Se déconnecter
            </button>
          </form>
        ) : (
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-secondary-900">
            Retour au tableau de bord
          </Link>
        )}
      </div>
    </main>
  )
}
