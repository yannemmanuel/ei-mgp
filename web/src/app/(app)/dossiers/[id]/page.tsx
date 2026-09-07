import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import {
  aPermission,
  peutChangerStatutDossier,
  peutCloturerDossier,
  peutCreerInvestigation,
  peutModifierInvestigation,
  peutReaffecterDossier,
  peutReouvrirDossier,
  peutValiderInvestigation,
  peutVoirInvestigation,
  peutCloturerAction,
  peutCreerAction,
  peutEnvoyerMessage,
  peutVoirMessagerie,
  peutModifierAction,
  peutVerifierEfficacite,
  peutVoirAction,
} from '@/server/authz'
import {
  actionsDuDossier,
  investigationsValidees,
} from '@/server/services/action-corrective/action-corrective'
import { investigationsDuDossier } from '@/server/services/investigation/investigation'
import { marquerMessagesLus, messagesDuDossier } from '@/server/services/messagerie/messagerie'
import { utilisateursAffectables } from '@/server/services/dossier/affectation'
import {
  affectationsActives,
  chargerFiche,
  historiqueDossier,
  piecesJointesDossier,
} from '@/server/services/dossier/fiche'
import { joursRestants } from '@/server/services/dossier/delais'
import { transitionsManuelles } from '@/server/services/dossier/workflow'
import { PanneauActions } from './panneau-actions'
import { PanneauInvestigations } from './panneau-investigations'
import { PanneauActionsCorrectives } from './panneau-actions-correctives'
import { PanneauMessagerie } from './panneau-messagerie'

export const metadata: Metadata = { title: 'Dossier' }

const dateFr = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(d) : '—'

export default async function PageDossier({ params }: PageProps<'/dossiers/[id]'>) {
  const { id } = await params
  const utilisateur = await exigerUtilisateur()

  const dossier = await chargerFiche(utilisateur, id)

  // `chargerFiche` renvoie `null` aussi bien pour un dossier inexistant que pour un dossier hors
  // périmètre : ne pas distinguer les deux, cette distinction révélerait son existence.
  if (!dossier) {
    notFound()
  }

  const pourPolicy = {
    parcoursCode: dossier.parcours.code as Parameters<typeof peutReaffecterDossier>[1]['parcoursCode'],
    isAnonymous: dossier.is_anonymous,
    declarantUserId: dossier.declarant_user_id,
  }

  const [
    historique,
    affectations,
    pieces,
    transitions,
    restants,
    affectables,
    investigations,
    actions,
    investigationsValidees_,
    messages,
    responsablesPossibles,
  ] = await Promise.all([
    historiqueDossier(id),
    affectationsActives(id),
    piecesJointesDossier(id),
    peutChangerStatutDossier(utilisateur, pourPolicy)
      ? transitionsManuelles(dossier.statutCode)
      : Promise.resolve([]),
    joursRestants({ id, statutCode: dossier.statutCode, parcoursId: dossier.parcours.id }),
    peutReaffecterDossier(utilisateur, pourPolicy) ? utilisateursAffectables(id) : Promise.resolve([]),
    investigationsDuDossier(id),
    actionsDuDossier(id),
    investigationsValidees(id),
    peutVoirMessagerie(utilisateur, { parcoursCode: pourPolicy.parcoursCode })
      ? messagesDuDossier(id)
      : Promise.resolve([]),
    // Liste des responsables possibles : conditionnee au droit de CREER une action, et non a
    // celui de reaffecter — les deux permissions sont distinctes et portees par des roles
    // differents.
    peutCreerAction(utilisateur, { parcoursCode: pourPolicy.parcoursCode })
      ? prisma.users.findMany({
          where: { actif: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  // Les policies s'evaluent ICI, cote serveur : le composant client ne recoit que des booleens
  // deja calcules, jamais de quoi les recalculer lui-meme.
  const contexteParcours = { parcoursCode: pourPolicy.parcoursCode }
  const investigationsVues = peutVoirInvestigation(utilisateur, {
    ...contexteParcours,
    enqueteurId: 0n,
  })
    ? investigations.map((i) => ({
        id: i.id,
        dateOuverture: i.date_ouverture.toISOString(),
        statut: i.statut,
        faitsConstates: i.faits_constates,
        personnesRencontrees: i.personnes_rencontrees,
        causeImmediate: i.cause_immediate,
        causesRacines: i.causes_racines,
        recommandations: i.recommandations,
        enqueteur: i.users_investigations_enqueteur_idTousers.name,
        validateur: i.users_investigations_valide_parTousers?.name ?? null,
        valideLe: i.valide_le?.toISOString() ?? null,
        peutModifier: peutModifierInvestigation(utilisateur, {
          ...contexteParcours,
          enqueteurId: i.enqueteur_id,
        }),
        // RGI-06 : faux pour l'enqueteur lui-meme.
        peutValider: peutValiderInvestigation(utilisateur, {
          ...contexteParcours,
          enqueteurId: i.enqueteur_id,
        }),
      }))
    : []

  const droitsActions = {
    creer: peutCreerAction(utilisateur, contexteParcours),
    modifier: peutModifierAction(utilisateur, contexteParcours),
    verifier: peutVerifierEfficacite(utilisateur, contexteParcours),
    cloturer: peutCloturerAction(utilisateur, contexteParcours),
  }

  const actionsVues = peutVoirAction(utilisateur, contexteParcours)
    ? actions.map((a) => ({
        id: a.id,
        intitule: a.intitule,
        description: a.description,
        echeance: a.echeance.toISOString(),
        statut: a.statut,
        verificationEfficacite: a.verification_efficacite,
        verificationCommentaire: a.verification_commentaire,
        dateCloture: a.date_cloture?.toISOString() ?? null,
        responsable: a.users.name,
      }))
    : []

  // Parité avec `MessagerieDossier::mount()` : ouvrir le dossier vaut lecture des messages du
  // déclarant. C'est une écriture pendant le rendu, assumée — la page est dynamique (elle lit la
  // session) et l'opération est idempotente : la relire ne change plus rien.
  if (messages.length > 0) {
    await marquerMessagesLus(id, 'agent')
  }

  const messagesVus = messages.map((m) => ({
    id: m.id,
    cote: m.expediteur_type === 'agent' ? ('agent' as const) : ('declarant' as const),
    auteur: m.expediteur_type === 'agent' ? (m.users?.name ?? 'Agent') : 'Déclarant',
    corps: m.corps,
    envoyeLe: (m.created_at ?? new Date()).toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dossiers" className="text-sm text-muted-foreground hover:text-secondary-900">
          ← Retour à la liste
        </Link>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{dossier.reference}</p>
          <h1 className="text-h2 text-secondary-900">
            {dossier.parcours.libelle} — {dossier.categories.libelle}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dossier.niveaux_gravite.niveau >= 4 ? 'destructive' : 'secondary'}>
            {dossier.niveaux_gravite.libelle}
          </Badge>
          <Badge variant="secondary">{dossier.statuts_dossier.libelle_interne}</Badge>
          {dossier.is_anonymous && <Badge variant="secondary">Anonyme</Badge>}
          {restants !== null && (
            <Badge variant={restants < 0 ? 'destructive' : restants <= 3 ? 'default' : 'secondary'}>
              {restants < 0
                ? `En retard (${Math.abs(restants)} j)`
                : `${restants} j avant échéance`}
            </Badge>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-secondary-700">{dossier.description}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {dossier.lieu && (
                  <div>
                    <dt className="text-caption text-muted-foreground">Lieu</dt>
                    <dd className="text-secondary-800">{dossier.lieu}</dd>
                  </div>
                )}
                {dossier.date_survenance && (
                  <div>
                    <dt className="text-caption text-muted-foreground">Date des faits</dt>
                    <dd className="text-secondary-800">{dateFr(dossier.date_survenance)}</dd>
                  </div>
                )}
                {dossier.caractere_repetitif && (
                  <div>
                    <dt className="text-caption text-muted-foreground">Caractère répétitif</dt>
                    <dd className="text-secondary-800">{dossier.caractere_repetitif}</dd>
                  </div>
                )}
                {dossier.attentes_declarant && (
                  <div>
                    <dt className="text-caption text-muted-foreground">Attentes du déclarant</dt>
                    <dd className="text-secondary-800">{dossier.attentes_declarant}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* RG-06 / acteurs.md : l'identité n'est même pas chargée pour un rôle qui n'y a pas
              droit — elle ne peut donc pas fuiter par un oubli d'affichage. */}
          {dossier.declaration_identites && (
            <Card>
              <CardHeader>
                <CardTitle className="text-h3">Identité du déclarant</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ['nom_prenom', 'Nom et prénom'],
                      ['matricule', 'Matricule'],
                      ['entreprise', 'Entreprise'],
                      ['fonction', 'Fonction'],
                      ['localite', 'Localité'],
                      ['statut_plaignant', 'Statut'],
                      ['contact_email', 'E-mail'],
                      ['contact_telephone', 'Téléphone'],
                    ] as const
                  ).map(([cle, libelle]) => {
                    const valeur = dossier.declaration_identites?.[cle]
                    if (!valeur) return null
                    return (
                      <div key={cle}>
                        <dt className="text-caption text-muted-foreground">{libelle}</dt>
                        <dd className="text-secondary-800">{String(valeur)}</dd>
                      </div>
                    )
                  })}
                </dl>
              </CardContent>
            </Card>
          )}

          {dossier.identiteMasquee && (
            <Alert>
              <AlertDescription>
                Les données nominatives de ce dossier ne sont pas accessibles à votre rôle.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Pièces jointes</CardTitle>
            </CardHeader>
            <CardContent>
              {pieces.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {pieces.map((p) => (
                    <li key={p.id} className="text-secondary-800">
                      {p.nom_original}{' '}
                      <span className="text-caption text-muted-foreground">
                        ({Math.round(Number(p.taille_octets) / 1024)} Ko)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <PanneauInvestigations
            dossierId={id}
            investigations={investigationsVues}
            peutOuvrir={peutCreerInvestigation(utilisateur, {
              ...contexteParcours,
              enqueteurId: utilisateur.id,
            })}
            dossierEnInvestigation={dossier.statutCode === 'en_investigation'}
          />

          <PanneauActionsCorrectives
            dossierId={id}
            actions={actionsVues}
            investigationsValidees={investigationsValidees_.map((i) => ({
              id: i.id,
              libelle: `Investigation du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(i.date_ouverture)}`,
            }))}
            responsables={responsablesPossibles.map((u) => ({ id: String(u.id), nom: u.name }))}
            droits={droitsActions}
            dossierEnActionCorrective={dossier.statutCode === 'action_corrective_en_cours'}
          />

          {peutVoirMessagerie(utilisateur, contexteParcours) && (
            <PanneauMessagerie
              dossierId={id}
              messages={messagesVus}
              peutEnvoyer={peutEnvoyerMessage(utilisateur, contexteParcours)}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Historique</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {historique.map((h) => (
                  <li key={String(h.id)} className="text-sm">
                    <p className="text-secondary-800">
                      <span className="font-medium">
                        {h.statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier.libelle_interne}
                      </span>{' '}
                      — {h.users?.name ?? 'Système'}
                    </p>
                    <p className="text-caption text-muted-foreground">{dateFr(h.created_at)}</p>
                    {h.commentaire && (
                      <p className="text-caption text-secondary-600">{h.commentaire}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <PanneauActions
          dossierId={id}
          statutCode={dossier.statutCode}
          affectations={affectations.map((a) => ({
            id: String(a.id),
            nom: a.users_dossier_affectations_user_idTousers.name,
          }))}
          affectables={affectables.map((u) => ({ id: String(u.id), nom: u.name }))}
          transitions={transitions.map((t) => ({ code: t.code, libelle: t.libelle_interne }))}
          droits={{
            reaffecter: peutReaffecterDossier(utilisateur, pourPolicy),
            changerStatut: peutChangerStatutDossier(utilisateur, pourPolicy),
            cloturer: peutCloturerDossier(utilisateur, pourPolicy),
            reouvrir: peutReouvrirDossier(utilisateur, pourPolicy),
            // RG-11 : le blocage contentieux relève du seul DPO, indépendamment des droits
            // détenus sur le dossier lui-même.
            gererContentieux: aPermission(utilisateur, 'rgpd.conservation.manage'),
          }}
          contentieux={dossier.contentieux}
        />
      </div>
    </div>
  )
}
