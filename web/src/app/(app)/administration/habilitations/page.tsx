import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { exigerPermission } from '@/server/auth'
import { DOMAINES, LIBELLES, LIBELLES_ROLE } from '@/server/authz'
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
      <div>
        <h1 className="text-h1 text-secondary-900">Habilitations</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {lignes.length} rôles, {permissions.length} droits. Chaque rôle donne accès à certaines
          actions ; toute modification s’applique immédiatement aux personnes qui le portent.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          <p className="font-medium">Trois garde-fous encadrent ces modifications.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-caption">
            <li>
              Le catalogue est fermé : seuls les rôles et permissions existants peuvent être
              associés. On ajuste qui obtient quoi, jamais ce qui existe.
            </li>
            <li>
              Le dernier accès administrateur ne peut pas être retiré : au moins un compte actif
              doit conserver la gestion des habilitations, sans quoi plus personne ne pourrait
              revenir en arrière.
            </li>
            <li>
              Chaque changement est journalisé avec son auteur, son avant et son après —
              consultable dans le{' '}
              <Link href="/audit?action=role.permissions_modifiees" className="underline underline-offset-2">
                journal d’audit
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
              {ecarts.length} rôle(s) diffèrent de la configuration livrée.
            </p>
            <p className="mt-1 text-caption">
              Ce n’est pas une anomalie — c’est la trace des ajustements décidés depuis. Le journal
              d’audit dit qui les a faits et quand.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <EditeurHabilitations
        roles={lignes.map((ligne) => ({
          role: ligne.role,
          libelle: LIBELLES_ROLE[ligne.role],
          permissions: [...ligne.permissions],
          comptes: ligne.comptes,
          retirees: ecartParRole.get(ligne.role)?.retirees ?? [],
          ajoutees: ecartParRole.get(ligne.role)?.ajoutees ?? [],
        }))}
        domaines={domaines}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Ce qui se règle ailleurs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-secondary-700">
          <p>
            Cet écran décide ce que peut faire un <strong>rôle</strong>. L’attribution des rôles
            aux <strong>personnes</strong> se fait dans la{' '}
            <Link
              href="/administration/utilisateurs"
              className="text-primary-700 underline underline-offset-2"
            >
              console des comptes
            </Link>
            .
          </p>
          <p>
            <strong>Aucun droit de suppression n’existe</strong>, et ce n’est pas un oubli : ni un
            dossier, ni un compte, ni un référentiel ne peut être supprimé. Ce qui n’a plus lieu
            d’être se <em>désactive</em>, pour que l’historique reste lisible et qu’un dossier
            gênant ne puisse pas disparaître. Seule exception, encadrée par la loi : l’effacement
            des données d’identité au terme du délai de conservation.
          </p>
          <p className="text-caption text-muted-foreground">
            Le cloisonnement par parcours — qui limite un rôle aux dossiers qui le concernent — est
            une dimension distincte, portée par le code et non par ces permissions. Retirer un
            droit ici ne l’élargit ni ne le restreint.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
