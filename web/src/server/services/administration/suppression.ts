import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser, type ModeleAudite } from '../audit/journal'

/**
 * Suppression protégée des éléments du back-office.
 *
 * Une seule règle : on efface ce que rien ne cite, on refuse le reste, et le message nomme ce qui
 * cite l'élément puis renvoie vers la désactivation.
 *
 * Catégories, postes et listes plates ont les leurs dans `referentiels.ts`, même principe.
 */

type Acteur = { id: bigint }

/** Un décompte de citations : ce qui cite, et combien de fois. */
type Citation = { readonly quoi: string; readonly combien: number }

/**
 * Refuse la suppression en nommant ce qui s'y oppose.
 *
 * ⚠️ Le message ÉNUMÈRE. « Cet élément est utilisé » n'apprend rien et ne se vérifie pas ; « cité
 * par 30 dossiers et 4 lignes de statistiques » dit où chercher, et permet de décider. Un
 * administrateur qui ne peut pas vérifier un refus finit par le contourner.
 */
function refuserSiCite(quoiEstSupprime: string, citations: readonly Citation[], remede: string): void {
  const bloquantes = citations.filter((c) => c.combien > 0)

  if (bloquantes.length === 0) return

  const liste = bloquantes
    .map((c) => `${c.combien} ${c.quoi}${c.combien > 1 ? 's' : ''}`)
    .join(' et ')

  throw new ErreurWorkflow(
    `${quoiEstSupprime} est cité par ${liste} : le supprimer rendrait ces données incohérentes. ${remede}`
  )
}

/**
 * Consigne la suppression, avec les valeurs effacées.
 *
 * ⚠️ C'est la SEULE trace qui restera de la ligne. Se contenter d'enregistrer « supprimé » rendrait
 * l'audit incapable de répondre à « qu'y avait-il exactement ? », qui est la question qu'on se
 * pose précisément quand une suppression pose problème.
 */
async function consigner(params: {
  acteur: Acteur
  action: string
  type: ModeleAudite
  /** `bigint` pour les référentiels, `string` pour un ULID : le journal stocke du texte. */
  id: bigint | string
  anciennes: Record<string, unknown>
}): Promise<void> {
  await journaliser({
    action: params.action,
    acteurId: params.acteur.id,
    auditableType: params.type,
    auditableId: String(params.id),
    anciennes: params.anciennes,
  })
}

const DESACTIVER = 'Désactivez-le plutôt : il disparaîtra des formulaires sans rien effacer.'

export async function supprimerCanalCaptage(acteur: Acteur, id: bigint): Promise<void> {
  const cible = await prisma.canaux_captage.findUniqueOrThrow({
    where: { id },
    select: { code: true, libelle: true, actif: true, _count: { select: { dossiers: true } } },
  })

  refuserSiCite(
    `Le canal « ${cible.libelle} »`,
    [{ quoi: 'dossier', combien: cible._count.dossiers }],
    DESACTIVER
  )

  await prisma.canaux_captage.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'canal_captage.supprime',
    type: MODELES.canalCaptage,
    id,
    anciennes: { code: cible.code, libelle: cible.libelle, actif: cible.actif },
  })
}

export async function supprimerNiveauGravite(acteur: Acteur, id: bigint): Promise<void> {
  const cible = await prisma.niveaux_gravite.findUniqueOrThrow({
    where: { id },
    select: {
      code: true,
      libelle: true,
      niveau: true,
      actif: true,
      _count: { select: { dossiers: true, statistiques_mensuelles: true } },
    },
  })

  refuserSiCite(
    `Le niveau « ${cible.libelle} »`,
    [
      { quoi: 'dossier', combien: cible._count.dossiers },
      { quoi: 'ligne de statistiques', combien: cible._count.statistiques_mensuelles },
    ],
    DESACTIVER
  )

  await prisma.niveaux_gravite.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'niveau_gravite.supprime',
    type: MODELES.niveauGravite,
    id,
    anciennes: {
      code: cible.code,
      libelle: cible.libelle,
      niveau: cible.niveau,
      actif: cible.actif,
    },
  })
}

/**
 * Supprime un site.
 *
 * ⚠️ Les DIRECTIONS rattachées comptent parmi les citations, au même titre que les dossiers. Un
 * site effacé sous ses directions les laisserait sans rattachement — et leurs déclarations
 * n'atteindraient plus personne, le site étant ce qui détermine à qui un dossier parvient.
 */
export async function supprimerSite(acteur: Acteur, id: bigint): Promise<void> {
  const cible = await prisma.sites.findUniqueOrThrow({
    where: { id },
    select: {
      code: true,
      libelle: true,
      actif: true,
      _count: { select: { directions: true, dossiers: true, users: true } },
    },
  })

  refuserSiCite(
    `Le site « ${cible.libelle} »`,
    [
      { quoi: 'direction', combien: cible._count.directions },
      { quoi: 'dossier', combien: cible._count.dossiers },
      { quoi: 'compte', combien: cible._count.users },
    ],
    DESACTIVER
  )

  await prisma.sites.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'site.supprime',
    type: MODELES.site,
    id,
    anciennes: { code: cible.code, libelle: cible.libelle, actif: cible.actif },
  })
}

/**
 * Supprime une direction.
 *
 * ⚠️ Compte les DEUX rattachements à un dossier : celui des faits et celui du déclarant. N'en
 * vérifier qu'un laisserait effacer une direction encore citée par l'autre.
 */
export async function supprimerDirection(acteur: Acteur, id: bigint): Promise<void> {
  const [cible, declarants] = await Promise.all([
    prisma.directions.findUniqueOrThrow({
      where: { id },
      select: {
        code: true,
        libelle: true,
        actif: true,
        site_id: true,
        _count: { select: { dossiers: true, postes: true, users: true } },
      },
    }),
    prisma.dossiers.count({ where: { direction_declarant_id: id } }),
  ])

  refuserSiCite(
    `La direction « ${cible.libelle} »`,
    [
      { quoi: 'dossier', combien: cible._count.dossiers },
      { quoi: 'dossier (direction du déclarant)', combien: declarants },
      { quoi: 'poste', combien: cible._count.postes },
      { quoi: 'compte', combien: cible._count.users },
    ],
    DESACTIVER
  )

  await prisma.directions.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'direction.supprimee',
    type: MODELES.direction,
    id,
    anciennes: {
      code: cible.code,
      libelle: cible.libelle,
      actif: cible.actif,
      site_id: cible.site_id === null ? null : String(cible.site_id),
    },
  })
}

/**
 * Supprime un modèle de notification.
 *
 * Aucune table n'y pointe : un message envoyé est recopié dans `notifications`.
 *
 * ⚠️ Mais il ÉTEINT un envoi — sans gabarit actif, `envoyerNotification()` journalise et n'envoie
 * rien. Seule suppression de ce module qui retire une fonction plutôt qu'une valeur.
 */
export async function supprimerGabarit(acteur: Acteur, id: bigint): Promise<void> {
  const cible = await prisma.notification_templates.findUniqueOrThrow({
    where: { id },
    select: {
      evenement_code: true,
      canal: true,
      objet: true,
      actif: true,
      parcours_id: true,
    },
  })

  await prisma.notification_templates.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'notification_template.supprime',
    type: MODELES.notificationTemplate,
    id,
    anciennes: {
      evenement_code: cible.evenement_code,
      canal: cible.canal,
      objet: cible.objet,
      actif: cible.actif,
      parcours_id: cible.parcours_id === null ? null : String(cible.parcours_id),
    },
  })
}

/**
 * Supprime un QR code — rien ne pointe vers lui, le canal est recopié sur le dossier au dépôt.
 *
 * La désactivation lui va souvent mieux : même effet pour qui scanne, mais le code reste
 * identifiable dans le journal et se réactive si l'affiche est encore au mur.
 */
export async function supprimerQrCode(acteur: Acteur, id: string): Promise<void> {
  const cible = await prisma.qr_codes.findUniqueOrThrow({
    where: { id },
    select: { token: true, url_cible: true, actif: true, parcours_id: true },
  })

  await prisma.qr_codes.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'qr_code.supprime',
    type: MODELES.qrCode,
    id,
    anciennes: {
      // Le jeton est consigné : c'est lui qui identifie l'affiche, et sans lui le journal ne
      // permettrait pas de savoir LEQUEL a été retiré.
      token: cible.token,
      url_cible: cible.url_cible,
      actif: cible.actif,
      parcours_id: cible.parcours_id === null ? null : String(cible.parcours_id),
    },
  })
}

/**
 * Supprime un statut de dossier. Une seule garde : les citations.
 *
 * ⚠️ Risque propre à ce référentiel : un statut est un ÉTAT du workflow, que le code nomme —
 * `creerDeclaration()` cherche « recu » à chaque dépôt. Supprimer une ligne attendue par le code
 * empêche toute création, même si rien ne la cite encore.
 *
 * La garde du graphe a été retirée sur décision métier ; le risque est rendu visible par
 * `santeAdministration()`, qui signale tout état absent et dit comment le restaurer.
 */
export async function supprimerStatut(acteur: Acteur, id: bigint): Promise<void> {
  const [cible, precedents, suivants] = await Promise.all([
    prisma.statuts_dossier.findUniqueOrThrow({
      where: { id },
      select: {
        code: true,
        libelle_interne: true,
        libelle_affiche: true,
        ordre: true,
        _count: { select: { dossiers: true } },
      },
    }),
    prisma.historique_statuts.count({ where: { statut_precedent_id: id } }),
    prisma.historique_statuts.count({ where: { statut_suivant_id: id } }),
  ])

  refuserSiCite(
    `Le statut « ${cible.libelle_interne} »`,
    [
      { quoi: 'dossier', combien: cible._count.dossiers },
      { quoi: 'ligne d’historique', combien: precedents + suivants },
    ],
    'Désactivez-le plutôt : il ne sera plus proposé comme destination, et les dossiers qui s’y trouvent y resteront.'
  )

  await prisma.statuts_dossier.delete({ where: { id } })
  await consigner({
    acteur,
    action: 'statut_dossier.supprime',
    type: MODELES.statutDossier,
    id,
    anciennes: {
      code: cible.code,
      libelle_interne: cible.libelle_interne,
      libelle_affiche: cible.libelle_affiche,
      ordre: cible.ordre,
    },
  })
}

/**
 * Ce qui rattache un compte à l'historique, et interdit donc de l'effacer.
 *
 * ⚠️ Il faut les douze : en oublier une laisserait l'audit dire « modifié par (inconnu) ».
 *
 * `utilisateur_parcours` et `invitations_connexion` sont volontairement absentes — elles
 * appartiennent au compte, ne documentent rien, et partent en cascade avec lui.
 */
async function tracesDuCompte(id: bigint): Promise<Citation[]> {
  const [
    audit,
    affectations,
    affectationsPosees,
    dossiers,
    historique,
    investigations,
    investigationsValidees,
    actions,
    messages,
    pieces,
    qrCodes,
    subordonnes,
  ] = await Promise.all([
    prisma.audit_logs.count({ where: { user_id: id } }),
    prisma.dossier_affectations.count({ where: { user_id: id } }),
    prisma.dossier_affectations.count({ where: { affecte_par: id } }),
    prisma.dossiers.count({ where: { declarant_user_id: id } }),
    prisma.historique_statuts.count({ where: { effectue_par: id } }),
    prisma.investigations.count({ where: { enqueteur_id: id } }),
    prisma.investigations.count({ where: { valide_par: id } }),
    prisma.actions_correctives.count({ where: { responsable_id: id } }),
    prisma.messages.count({ where: { expediteur_user_id: id } }),
    prisma.pieces_jointes.count({ where: { televerse_par: id } }),
    prisma.qr_codes.count({ where: { genere_par: id } }),
    prisma.users.count({ where: { responsable_hierarchique_id: id } }),
  ])

  return [
    { quoi: 'ligne du journal', combien: audit },
    { quoi: 'affectation', combien: affectations + affectationsPosees },
    { quoi: 'déclaration déposée', combien: dossiers },
    { quoi: 'changement de statut', combien: historique },
    { quoi: 'investigation', combien: investigations + investigationsValidees },
    { quoi: 'action corrective', combien: actions },
    { quoi: 'message', combien: messages },
    { quoi: 'pièce jointe', combien: pieces },
    { quoi: 'QR code', combien: qrCodes },
    { quoi: 'compte dont il est le responsable', combien: subordonnes },
  ]
}

/**
 * Supprime un compte QUI N'A RIEN FAIT : créé par erreur, jamais utilisé.
 *
 * Dès qu'il a laissé une trace — une connexion suffit — seule la désactivation reste possible.
 * Elle coupe l'accès immédiatement tout en gardant le compte nommé dans l'audit, ce qui rend le
 * dispositif vérifiable.
 */
export async function supprimerCompte(acteur: Acteur, id: bigint): Promise<void> {
  if (id === acteur.id) {
    throw new ErreurWorkflow('Vous ne pouvez pas supprimer votre propre compte.')
  }

  const cible = await prisma.users.findUniqueOrThrow({
    where: { id },
    select: { name: true, email: true, actif: true },
  })

  refuserSiCite(
    `Le compte « ${cible.name} »`,
    await tracesDuCompte(id),
    'Désactivez-le plutôt : son accès est coupé immédiatement, et l’historique reste lisible.'
  )

  // `model_has_roles` est POLYMORPHE, donc sans cascade : sans ce nettoyage, l'association
  // survivrait au compte et reviendrait au prochain identifiant réutilisant ce numéro.
  await prisma.model_has_roles.deleteMany({
    where: { model_type: MODELES.utilisateur, model_id: id },
  })

  await prisma.users.delete({ where: { id } })

  await consigner({
    acteur,
    action: 'user.supprime',
    type: MODELES.utilisateur,
    id,
    // ⚠️ Jamais l'empreinte du mot de passe : l'audit consigne ce qui a disparu, pas un secret.
    anciennes: { name: cible.name, email: cible.email, actif: cible.actif },
  })
}
