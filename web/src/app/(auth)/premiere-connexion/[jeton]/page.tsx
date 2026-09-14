import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LONGUEUR_MINIMALE, OCTETS_MAXIMUM } from '@/server/auth/mot-de-passe'
import { MESSAGES, verifierInvitation } from '@/server/services/administration/invitation'
import { FormulairePremiereConnexion } from './formulaire'

export const metadata: Metadata = { title: 'Première connexion' }

/**
 * Écran d'ouverture d'un compte, atteint par le lien reçu par e-mail.
 *
 * ⚠️ PUBLIQUE, et elle doit l'être : la personne n'a pas encore de mot de passe, elle ne peut donc
 * pas être connectée. Le jeton tient lieu d'authentification, pour cette page et pour elle seule.
 *
 * ⚠️ `force-dynamic` : un lien à usage unique ne se met pas en cache. Une page rendue une fois
 * puis resservie annoncerait « lien valide » à quelqu'un arrivant après sa consommation, et
 * n'afficherait jamais l'expiration.
 */
export const dynamic = 'force-dynamic'

export default async function PagePremiereConnexion({
  params,
}: PageProps<'/premiere-connexion/[jeton]'>) {
  const { jeton } = await params
  const invitation = await verifierInvitation(jeton)

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
          <CardTitle className="mt-4 font-serif text-h1">
            {invitation.etat === 'valide' ? 'Bienvenue' : 'Ce lien ne fonctionne pas'}
          </CardTitle>
          <CardDescription>
            {invitation.etat === 'valide'
              ? `${invitation.nom}, choisissez le mot de passe qui ouvrira votre compte.`
              : 'Mécanisme de Gestion des Plaintes'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitation.etat === 'valide' ? (
            <FormulairePremiereConnexion
              jeton={jeton}
              email={invitation.email}
              longueurMinimale={LONGUEUR_MINIMALE}
              octetsMaximum={OCTETS_MAXIMUM}
            />
          ) : (
            <div className="space-y-4">
              {/*
                Le motif est NOMMÉ : consommé, expiré, ou inconnu.

                Les trois appellent des gestes différents — se connecter avec le mot de passe
                déjà choisi, demander un nouveau lien, ou vérifier qu'on a copié l'adresse en
                entier. Un « lien invalide » unique les confondrait, et enverrait appeler
                l'administration dans deux cas sur trois où ce n'est pas nécessaire.

                ⚠️ Aucun des trois messages ne dit si un compte existe à cette adresse : le
                distinguer transformerait cette page en outil d'énumération.
              */}
              <Alert variant="destructive">
                <AlertDescription>{MESSAGES[invitation.etat]}</AlertDescription>
              </Alert>

              <Button render={<Link href="/login" />} variant="outline" className="w-full">
                Aller à la page de connexion
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
