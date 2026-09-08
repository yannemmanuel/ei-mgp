import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import { LIBELLES, LIBELLES_ROLE, PERMISSIONS, type Permission, type Role } from '@/server/authz'

export const metadata: Metadata = { title: 'Accès refusé' }
export const dynamic = 'force-dynamic'

/**
 * Équivalent du 403 Laravel.
 *
 * Le message nomme la capacité requise et les rôles qui la portent, ce que la version précédente
 * taisait — on repartait sans savoir ni ce qui manquait, ni à qui le demander.
 *
 * Ce n'est pas la fuite que redoute `exigences-securite.md` §5 : celle-là porte sur l'EXISTENCE
 * d'un dossier, et un dossier hors périmètre répond `notFound()` — jamais ce chemin, qui ne sert
 * qu'aux refus de capacité sur une page. La personne est authentifiée et sait déjà qu'on lui
 * refuse l'écran ; lui dire quel droit l'ouvrirait ne divulgue aucune donnée, et lui évite un
 * détour par le support.
 *
 * ⚠️ Le paramètre vient de l'URL : il est validé contre le catalogue FERMÉ des permissions avant
 * d'être affiché, et seul son libellé lisible est rendu. Sans cela, n'importe qui pourrait faire
 * afficher n'importe quel texte sur une page de l'application.
 */
export default async function PageAccesRefuse({ searchParams }: PageProps<'/acces-refuse'>) {
  /**
   * Oui, même ici.
   *
   * Cette page lit la base — les rôles qui portent le droit manquant — et ne l'entourait d'aucune
   * vérification : seul `proxy.ts` en gardait l'entrée, alors que son en-tête dit en toutes
   * lettres qu'il N'EST PAS un contrôle d'accès (il ne consulte pas la base et peut s'exécuter en
   * périphérie). Une page de refus qui répondrait à un visiteur non authentifié lui apprendrait la
   * structure des rôles sans qu'il ait jamais eu de compte.
   */
  await exigerUtilisateur()

  const parametres = await searchParams
  const brut = Array.isArray(parametres.droit) ? parametres.droit[0] : parametres.droit
  const droit =
    brut !== undefined && (PERMISSIONS as readonly string[]).includes(brut)
      ? (brut as Permission)
      : null

  const porteurs = droit === null ? [] : await rolesPortant(droit)

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-secondary-400" aria-hidden />
        <h1 className="mt-4 text-h2 text-secondary-900">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre rôle ne vous autorise pas à consulter cette page.
        </p>
      </div>

      {droit !== null && (
        <Card className="mt-6">
          <CardContent className="space-y-3 p-5 text-sm">
            <div>
              <p className="text-caption text-muted-foreground">Droit requis</p>
              <p className="text-secondary-900">{LIBELLES[droit].libelle}</p>
              <p className="mt-0.5 text-caption text-secondary-600">{LIBELLES[droit].explication}</p>
            </div>

            <div>
              <p className="text-caption text-muted-foreground">Qui le détient aujourd’hui</p>
              {porteurs.length === 0 ? (
                <p className="text-secondary-900">
                  Aucun rôle actif ne le porte. Un administrateur peut l’accorder depuis les
                  habilitations.
                </p>
              ) : (
                <p className="text-secondary-900">{porteurs.join(', ')}</p>
              )}
            </div>

            <p className="text-caption text-muted-foreground">
              Ce droit s’accorde depuis l’écran des habilitations, et prend effet immédiatement.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-center">
        <Button render={<Link href="/dashboard" />}>Retour au tableau de bord</Button>
      </div>
    </div>
  )
}

/** Rôles ACTIFS portant ce droit, sous leur nom lisible — un rôle éteint ne confère plus rien. */
async function rolesPortant(droit: Permission): Promise<string[]> {
  const roles = await prisma.roles.findMany({
    where: {
      guard_name: 'web',
      actif: true,
      role_has_permissions: { some: { permissions: { name: droit, guard_name: 'web' } } },
    },
    select: { name: true, libelle: true },
    orderBy: { libelle: 'asc' },
  })

  return roles.map((r) => r.libelle || LIBELLES_ROLE[r.name as Role] || r.name)
}
