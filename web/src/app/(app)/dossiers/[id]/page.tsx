import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EtiquetteStatut, type TonStatut } from '@/components/ui/etiquette-statut'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { prisma } from '@/lib/prisma'
import { exigerUtilisateur } from '@/server/auth'
import {
  acteursDeLEtape,
  aPermission,
  LIBELLES_ROLE,
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
import {
  investigationsDuDossier,
  rolesValidateurs,
} from '@/server/services/investigation/investigation'
import { marquerMessagesLus, messagesDuDossier } from '@/server/services/messagerie/messagerie'
import { utilisateursAffectables } from '@/server/services/dossier/affectation'
import {
  affectationsActives,
  chargerFiche,
  historiqueDossier,
  piecesJointesDossier,
} from '@/server/services/dossier/fiche'
import { dateLimiteGlobale, joursRestants } from '@/server/services/dossier/delais'
import { transitionsManuelles } from '@/server/services/dossier/workflow'
import { FilAriane } from '@/components/layout/fil-ariane'
import { SommaireDossier, type SectionDossier } from './sommaire'
import { PanneauActions } from './panneau-actions'
import { PanneauInvestigations } from './panneau-investigations'
import { PanneauActionsCorrectives } from './panneau-actions-correctives'
import { PanneauMessagerie } from './panneau-messagerie'
import { PanneauPiecesJointes } from './panneau-pieces-jointes'

export const metadata: Metadata = { title: 'Dossier' }

const dateFr = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(d) : '—'

const dateCourteFr = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d) : '—'

/** Échelle de gravité 1-4 (CDC §11.1) : seul le palier haut passe en alerte. */
function tonGravite(niveau: number): TonStatut {
  if (niveau >= 4) return 'alerte'
  if (niveau === 3) return 'attention'
  return 'neutre'
}

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
    statutCode: dossier.statutCode,
    isAnonymous: dossier.is_anonymous,
    declarantUserId: dossier.declarant_user_id,
    siteId: dossier.site_id,
    estAffecteAuLecteur: dossier.estAffecteAuLecteur,
  }

  const [
    historique,
    affectations,
    pieces,
    transitions,
    restants,
    limiteGlobale,
    affectables,
    investigations,
    actions,
    investigationsValidees_,
    messages,
    responsablesPossibles,
    validateurs,
  ] = await Promise.all([
    historiqueDossier(id),
    affectationsActives(id),
    piecesJointesDossier(id),
    peutChangerStatutDossier(utilisateur, pourPolicy)
      ? transitionsManuelles(dossier.statutCode)
      : Promise.resolve([]),
    joursRestants({ id, statutCode: dossier.statutCode, parcoursId: dossier.parcours.id }),
    dateLimiteGlobale({ parcoursId: dossier.parcours.id, creeLe: dossier.created_at ?? new Date() }),
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
    rolesValidateurs(pourPolicy.parcoursCode),
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
        estLEnqueteur: i.enqueteur_id === utilisateur.id,
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

  // Le sommaire ne liste que les sections réellement présentes : proposer « Identité du
  // déclarant » sur un dossier anonyme mènerait à une ancre vide.
  const sections: SectionDossier[] = [
    { id: 'description', libelle: 'Description' },
    ...(dossier.declaration_identites ? [{ id: 'identite', libelle: 'Identité' }] : []),
    { id: 'pieces-jointes', libelle: 'Pièces jointes', nombre: pieces.length },
    { id: 'investigations', libelle: 'Investigations', nombre: investigationsVues.length },
    { id: 'actions-correctives', libelle: 'Actions correctives', nombre: actionsVues.length },
    ...(peutVoirMessagerie(utilisateur, contexteParcours)
      ? [{ id: 'messagerie', libelle: 'Messagerie', nombre: messagesVus.length }]
      : []),
    { id: 'historique', libelle: 'Historique', nombre: historique.length },
  ]

  return (
    <div className="space-y-5">
      <FilAriane
        mailles={[{ libelle: 'Dossiers', href: '/dossiers' }, { libelle: dossier.reference }]}
      />

      {/* En-tête : ce qu'est ce dossier à gauche, où il en est à droite. L'ordre des étiquettes
          est fixe — statut, gravité, échéance — pour que l'œil les retrouve au même endroit d'un
          dossier à l'autre. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-caption text-muted-foreground">
                {dossier.reference}
              </span>
              {dossier.is_anonymous && (
                <EtiquetteStatut ton="neutre">Déclarant anonyme</EtiquetteStatut>
              )}
            </div>
            <h1 className="mt-1 text-h1 text-secondary-900">{dossier.categories.libelle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {dossier.parcours.libelle} · reçu le {dateCourteFr(dossier.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <EtiquetteStatut ton="encours">
              {dossier.statuts_dossier.libelle_interne}
            </EtiquetteStatut>
            <EtiquetteStatut ton={tonGravite(dossier.niveaux_gravite.niveau)}>
              Gravité : {dossier.niveaux_gravite.libelle}
            </EtiquetteStatut>
            {restants !== null && (
              <EtiquetteStatut
                ton={restants < 0 ? 'alerte' : restants <= 3 ? 'attention' : 'neutre'}
              >
                {restants < 0
                  ? `En retard de ${Math.abs(restants)} j`
                  : restants === 0
                    ? 'Échéance aujourd’hui'
                    : `${restants} j avant échéance`}
              </EtiquetteStatut>
            )}
            {/* CDC §11.2 : enveloppe totale depuis la création (DT-23). Un dossier peut tenir
                chacune de ses étapes et dépasser malgré tout ce délai d'ensemble. */}
            {limiteGlobale !== null && limiteGlobale < new Date() && (
              <EtiquetteStatut ton="alerte">Délai global dépassé</EtiquetteStatut>
            )}
          </div>
        </div>
      </Card>

      <SommaireDossier sections={sections} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* `scroll-mt` compense la barre supérieure et le sommaire, tous deux collants : sans
              lui, l'ancre dépose le titre de section DERRIÈRE eux. */}
          <section id="description" className="scroll-mt-28">
            <Card>
              <CardHeader>
                <CardTitle className="text-h3">Description</CardTitle>
              </CardHeader>
              <CardContent>
                {dossier.description.trim() === '' ? (
                  // La description est facultative depuis le 08/09/2026 : un dossier peut n'en
                  // porter aucune. Le dire explicitement évite de laisser croire à un défaut
                  // d'affichage — et oriente vers le seul endroit où l'obtenir.
                  <p className="text-sm text-muted-foreground">
                    Aucune description n’a été saisie lors de la déclaration. La messagerie du
                    dossier permet d’en demander une au déclarant, s’il n’est pas anonyme.
                  </p>
                ) : (
                  <p className="whitespace-pre-line text-sm text-secondary-700">
                    {dossier.description}
                  </p>
                )}

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['Lieu', dossier.lieu],
                      [
                        'Date des faits',
                        dossier.date_survenance ? dateCourteFr(dossier.date_survenance) : null,
                      ],
                      ['Caractère répétitif', dossier.caractere_repetitif],
                      ['Attentes du déclarant', dossier.attentes_declarant],
                    ] as const
                  ).map(([libelle, valeur]) =>
                    valeur ? (
                      <div key={libelle}>
                        <dt className="text-caption text-muted-foreground">{libelle}</dt>
                        <dd className="text-sm text-secondary-800">{valeur}</dd>
                      </div>
                    ) : null
                  )}
                </dl>
              </CardContent>
            </Card>
          </section>

          {/* RG-06 / acteurs.md : l'identité n'est même pas chargée pour un rôle qui n'y a pas
              droit — elle ne peut donc pas fuiter par un oubli d'affichage. */}
          {dossier.declaration_identites && (
            <section id="identite" className="scroll-mt-28">
              <Card>
                <CardHeader>
                  <CardTitle className="text-h3">Identité du déclarant</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3 sm:grid-cols-2">
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
                          <dd className="text-sm text-secondary-800">{String(valeur)}</dd>
                        </div>
                      )
                    })}
                  </dl>
                </CardContent>
              </Card>
            </section>
          )}

          {dossier.identiteMasquee && (
            <Alert>
              <AlertDescription>
                Les données nominatives de ce dossier ne sont pas accessibles à votre rôle.
              </AlertDescription>
            </Alert>
          )}

          <section id="pieces-jointes" className="scroll-mt-28">
            <PanneauPiecesJointes
              pieces={pieces.map((p) => ({
                id: p.id,
                nomOriginal: p.nom_original,
                mimeType: p.mime_type,
                tailleOctets: Number(p.taille_octets),
              }))}
            />
          </section>

          <section id="investigations" className="scroll-mt-28">
            <PanneauInvestigations
              dossierId={id}
              investigations={investigationsVues}
              peutOuvrir={peutCreerInvestigation(utilisateur, {
                ...contexteParcours,
                enqueteurId: utilisateur.id,
              })}
              dossierEnInvestigation={dossier.statutCode === 'en_investigation'}
              validateurs={validateurs}
            />
          </section>

          <section id="actions-correctives" className="scroll-mt-28">
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
          </section>

          {peutVoirMessagerie(utilisateur, contexteParcours) && (
            <section id="messagerie" className="scroll-mt-28">
              <PanneauMessagerie
                dossierId={id}
                messages={messagesVus}
                peutEnvoyer={peutEnvoyerMessage(utilisateur, contexteParcours)}
              />
            </section>
          )}

          <section id="historique" className="scroll-mt-28">
            <Card>
              <CardHeader>
                <CardTitle className="text-h3">Historique</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Frise verticale : le trait relie les étapes et donne à voir d'un coup le chemin
                    parcouru, là où une liste à puces demandait de le reconstituer. */}
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {historique.map((h) => (
                    <li key={String(h.id)} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-secondary-300 ring-4 ring-card"
                      />
                      <p className="text-sm text-secondary-800">
                        <span className="font-medium">
                          {
                            h
                              .statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier
                              .libelle_interne
                          }
                        </span>{' '}
                        — {h.users?.name ?? 'Système'}
                      </p>
                      <p className="text-caption text-muted-foreground">{dateFr(h.created_at)}</p>
                      {h.commentaire && (
                        <p className="mt-1 text-caption text-secondary-600">{h.commentaire}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Colonne d'actions collante : sur un dossier long, changer de statut ne doit pas
            imposer de remonter en haut de page. */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <PanneauActions
            dossierId={id}
            statutCode={dossier.statutCode}
            affectations={affectations.map((a) => ({
              id: String(a.id),
              nom: a.users_dossier_affectations_user_idTousers.name,
            }))}
            affectables={affectables.map((u) => ({ id: String(u.id), nom: u.name }))}
            transitions={transitions.map((t) => ({ code: t.code, libelle: t.libelle_interne }))}
            acteursDeLEtape={(acteursDeLEtape(pourPolicy.parcoursCode, dossier.statutCode) ?? []).map(
              (role) => LIBELLES_ROLE[role] ?? role
            )}
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
    </div>
  )
}
