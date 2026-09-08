import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EnTetePage } from '@/components/layout/en-tete-page'
import { exigerPermission } from '@/server/auth'
import { DOMAINES, LIBELLES } from '@/server/authz'
import { chargerHabilitations } from '@/server/services/administration/habilitations'
import { EditeurHabilitations } from './editeur'

export const metadata: Metadata = { title: 'Administration — Habilitations' }
export const dynamic = 'force-dynamic'

/**
 * Qui a le droit de faire quoi — et modification de ces droits.
 *
 * Ce que montre l'écran est ce qui S'APPLIQUE : les permissions sont relues en base à chaque
 * requête. Une modification prend donc effet immédiatement, pour tous les comptes portant le
 * rôle, sans redéploiement.
 */
export default async function PageHabilitations() {
  await exigerPermission('roles.manage')

  const { lignes, permissions, ecarts } = await chargerHabilitations()
  const ecartParRole = new Map(ecarts.map((e) => [e.role, e]))

  // Les libellés sont résolus ici, côté serveur : le composant d'édition reçoit du texte prêt à
  // lire, jamais des identifiants qu'il devrait traduire lui-même.
  const domaines = DOMAINES.map((domaine) => ({
    cle: domaine.cle,
    titre: domaine.titre,
    description: domaine.description,
    permissions: domaine.permissions.map((nom) => ({ nom, ...LIBELLES[nom] })),
  }))

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Habilitations"
        lede="Ce que chaque rôle a le droit de faire. Une modification s’applique tout de suite."
        mailles={[
          { libelle: 'Administration', href: '/administration' },
          { libelle: 'Habilitations' },
        ]}
        compteur={`${lignes.filter((l) => l.actif).length} rôles actifs sur ${lignes.length} · ${permissions.length} droits`}
      />

      <Alert>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-5 text-caption">
            <li>Vous choisissez qui obtient quoi ; la liste des droits, elle, ne change pas ici.</li>
            <li>Un compte au moins doit garder la gestion des habilitations : le dernier ne peut pas être retiré.</li>
            <li>
              Chaque changement est enregistré, avec son auteur et sa date, dans le{' '}
              <Link href="/audit?action=role.permissions_modifiees" className="underline underline-offset-2">
                journal
              </Link>
              .
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      {ecarts.length > 0 && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">
              {ecarts.length} rôle(s) ont été ajustés depuis la mise en service.
            </p>
            <p className="mt-1 text-caption">Le journal dit qui les a modifiés, et quand.</p>
          </AlertDescription>
        </Alert>
      )}

      <EditeurHabilitations
        roles={lignes.map((ligne) => ({
          role: ligne.role,
          libelle: ligne.libelle,
          description: ligne.description,
          actif: ligne.actif,
          permissions: [...ligne.permissions],
          comptes: ligne.comptes,
          retirees: ecartParRole.get(ligne.role)?.retirees ?? [],
          ajoutees: ecartParRole.get(ligne.role)?.ajoutees ?? [],
        }))}
        domaines={domaines}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Bon à savoir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-secondary-700">
          <p>
            Ici, ce que peut faire un rôle. Pour donner un rôle à quelqu’un, allez dans les{' '}
            <Link
              href="/administration/utilisateurs"
              className="text-primary-700 underline underline-offset-2"
            >
              comptes
            </Link>
            .
          </p>
          <p>
            Rien ne se supprime dans l’application : ce qui n’a plus lieu d’être se désactive, et
            reste visible dans l’historique.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
