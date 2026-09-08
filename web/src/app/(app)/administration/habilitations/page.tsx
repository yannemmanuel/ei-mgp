import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { exigerPermission } from '@/server/auth'
import { chargerHabilitations } from '@/server/services/administration/habilitations'

export const metadata: Metadata = { title: 'Administration — Habilitations' }
export const dynamic = 'force-dynamic'

/**
 * Qui a le droit de faire quoi.
 *
 * En **lecture seule** : les habilitations sont décidées dans le code, la base n'en est qu'un
 * reflet. L'écran le dit explicitement plutôt que de proposer des commandes inertes — et il
 * signale tout écart entre la décision et son application.
 */
export default async function PageHabilitations() {
  await exigerPermission('roles.manage')

  const { lignes, permissions, ecarts } = await chargerHabilitations()

  // Regroupe par préfixe (`dossiers.`, `reporting.`…) : 36 permissions en une seule liste
  // seraient illisibles, et le préfixe correspond au domaine métier.
  const domaines = new Map<string, string[]>()
  for (const permission of permissions) {
    const domaine = permission.split('.')[0]
    domaines.set(domaine, [...(domaines.get(domaine) ?? []), permission])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 text-secondary-900">Habilitations</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {lignes.length} rôles, {permissions.length} permissions. Cette matrice est la référence :
          c’est elle qui décide, pour chaque rôle, ce qu’il peut faire dans l’application.
        </p>
      </div>

      {ecarts.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <p className="font-medium">
              Les droits appliqués ne correspondent pas à ceux qui ont été décidés.
            </p>
            <ul className="mt-2 space-y-1">
              {ecarts.map((ecart) => (
                <li key={ecart.role} className="text-caption">
                  <span className="font-mono">{ecart.role}</span>
                  {ecart.manquantes.length > 0 && (
                    <> — manquantes en base : {ecart.manquantes.join(', ')}</>
                  )}
                  {ecart.enTrop.length > 0 && <> — en trop en base : {ecart.enTrop.join(', ')}</>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption">
              Une permission manquante prive d’un accès prévu ; une permission en trop en accorde
              un qui n’a pas été décidé. Rejouez les référentiels (<code>npm run seed</code>) pour
              rétablir la correspondance.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert role="status">
          <AlertDescription>
            Les droits appliqués correspondent exactement à ceux décidés. Vérifié à l’instant, rôle
            par rôle.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 font-medium text-muted-foreground">Rôle</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">Comptes actifs</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.role} className="border-b border-border/50 align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-secondary-900">
                      {ligne.role}
                    </td>
                    <td className="px-4 py-3">
                      {/* Un rôle que personne ne porte n'est pas une erreur, mais mérite d'être
                          questionné : soit il attend des comptes, soit il n'a plus d'objet. */}
                      <Badge variant={ligne.comptes === 0 ? 'secondary' : 'default'}>
                        {ligne.comptes}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {ligne.permissions.length === 0 ? (
                        <span className="text-muted-foreground">Aucune</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {ligne.permissions.map((permission) => (
                            <Badge key={permission} variant="secondary" className="font-normal">
                              {permission}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Pourquoi cette matrice n’est pas modifiable ici</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-secondary-700">
          <p>
            Les habilitations sont décidées dans le code de l’application, et la base n’en est
            qu’un reflet, écrit au déploiement. Un contrôle automatique compare les deux à chaque
            exécution des tests — il a déjà détecté une dérive réelle que rien d’autre n’aurait
            signalée.
          </p>
          <p>
            Les rendre modifiables depuis cet écran supprimerait ce contrôle : plus rien ne
            distinguerait un changement voulu d’une altération. Sur un dispositif qui traite des
            signalements — dont certains anonymes, dont certains mettent en cause des personnes —
            c’est un garde-fou qu’il vaut mieux garder.
          </p>
          <p>
            Ce qui se règle depuis l’application, ce sont les <strong>rôles attribués à chaque
            compte</strong> :{' '}
            <Link
              href="/administration/utilisateurs"
              className="text-primary-700 underline underline-offset-2"
            >
              console des comptes
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...domaines.entries()].map(([domaine, liste]) => (
          <Card key={domaine} className="p-4">
            <p className="text-label uppercase tracking-wide text-secondary-500">{domaine}</p>
            <ul className="mt-2 space-y-0.5">
              {liste.map((permission) => (
                <li key={permission} className="font-mono text-caption text-secondary-700">
                  {permission}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}
