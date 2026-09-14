import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, journaliser, type ModeleAudite } from '../audit/journal'

/**
 * Suppression PROTÉGÉE des éléments du back-office.
 *
 * Une seule règle, et elle vaut pour tout ce qui se supprime ici : **on efface ce que rien ne
 * cite, on refuse le reste, et on dit quoi faire à la place.** Un référentiel cité par un dossier
 * n'est pas un encombrement dont on se débarrasse : c'est la seule chose qui rende ce dossier
 * lisible. Le supprimer ne libère rien, il rend un historique incompréhensible.
 *
 * ⚠️ Le refus n'est pas une impasse. Chaque message nomme ce qui cite l'élément, en toutes
 * lettres, et renvoie vers la DÉSACTIVATION — qui retire la valeur des formulaires tout en la
 * laissant lisible sur les déclarations qui l'ont déjà choisie. C'est ce que l'administrateur
 * cherche neuf fois sur dix quand il clique sur « Supprimer ».
 *
 * Ce module rassemble les suppressions qui n'existaient pas. Les catégories, les postes et les
 * listes plates ont les leurs dans `referentiels.ts`, écrites sur ce même principe.
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
 * Aucune table ne pointe vers lui : un message envoyé est recopié dans `notifications`, il n'y
 * renvoie pas. Effacer le gabarit ne réécrit donc aucun message déjà parti.
 *
 * ⚠️ Mais il ÉTEINT un envoi. Sans gabarit actif pour un évènement, `envoyerNotification()`
 * journalise un avertissement et n'envoie rien — silencieusement, du point de vue de qui attend
 * le message. C'est la seule suppression de ce module qui retire une fonction plutôt qu'une
 * valeur, et le message d'avertissement de l'écran doit le dire.
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
 * Supprime un QR code.
 *
 * Rien ne pointe vers lui : le canal d'origine est recopié sur le dossier au dépôt. Effacer le
 * code ne touche donc à aucune déclaration déjà reçue — il rend seulement l'affiche inopérante.
 *
 * ⚠️ Et c'est justement pour cela que la DÉSACTIVATION lui va souvent mieux : un QR code
 * supprimé et un QR code désactivé se comportent pareil pour qui le scanne, mais le second reste
 * identifiable dans le journal, et se réactive si l'affiche est encore au mur.
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
 * Supprime un statut de dossier.
 *
 * Une seule garde : les CITATIONS. Un statut qu'aucun dossier n'a atteint et qu'aucune ligne
 * d'historique ne mentionne s'efface ; les autres sont refusés, comme partout ailleurs.
 *
 * ⚠️ LE RISQUE PROPRE À CE RÉFÉRENTIEL, à connaître avant de s'en servir.
 *
 * Un statut n'est pas une valeur, c'est un ÉTAT du workflow, et le code le nomme : `STATUTS`
 * énumère les dix, `TRANSITIONS_AUTORISEES` décrit qui mène à quoi, et `creerDeclaration()`
 * cherche « recu » par son code à chaque dépôt. Supprimer une ligne que le code attend
 * n'appauvrit pas un affichage : sur une base où rien ne la cite encore, elle empêche la
 * création de toute déclaration.
 *
 * Une garde du graphe a existé ici et a été RETIRÉE sur décision métier : la suppression d'un
 * statut doit être possible. Le risque n'est pas nié pour autant — il est rendu VISIBLE :
 * `santeAdministration()` signale tout état du workflow absent de la base, et dit comment le
 * restaurer. Un dispositif cassé qui s'annonce vaut mieux qu'un dispositif cassé qui se découvre
 * au premier dépôt refusé.
 *
 * La DÉSACTIVATION reste la voie douce, et elle a désormais un effet réel : un statut inactif
 * n'est plus proposé comme destination d'une transition manuelle, tandis que les dossiers qui s'y
 * trouvent y restent et continuent d'en sortir.
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
 * ⚠️ Douze relations, et il faut les douze. En oublier une laisserait supprimer un compte cité
 * par elle — l'audit dirait alors « modifié par (inconnu) », précisément ce que la traçabilité
 * d'un dispositif de signalement doit empêcher.
 *
 * Deux relations sont volontairement ABSENTES de ce décompte : `utilisateur_parcours` et
 * `invitations_connexion`. Elles appartiennent au compte, ne documentent rien, et disparaissent
 * avec lui (`ON DELETE CASCADE`). Les compter interdirait de supprimer un compte pour la seule
 * raison qu'on lui a confié un parcours — c'est-à-dire à peu près tous.
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
 * Supprime un compte QUI N'A RIEN FAIT.
 *
 * Le cas visé est le compte créé par erreur, jamais utilisé : une adresse mal saisie, un doublon,
 * un essai. Dès qu'il a laissé une trace — une connexion suffit, elle est journalisée — seule la
 * désactivation reste possible, et c'est ce que le message dit.
 *
 * ⚠️ La désactivation n'est PAS un pis-aller. Elle coupe l'accès immédiatement — les droits sont
 * relus en base à chaque requête — tout en gardant le compte nommé dans l'audit et l'historique.
 * Sur un dispositif de signalement, pouvoir dire qui a traité quel dossier n'est pas une
 * commodité : c'est ce qui rend le dispositif vérifiable.
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

  /*
    Ce qui appartient au compte part avec lui.

    `utilisateur_parcours` et `invitations_connexion` sont déjà en `ON DELETE CASCADE` ;
    `model_has_roles` ne l'est pas — c'est une table de spatie, polymorphe, sans clé étrangère
    vers `users`. Sans ce nettoyage, l'association survivrait au compte et serait réattribuée au
    prochain identifiant réutilisant ce numéro.
  */
  await prisma.model_has_roles.deleteMany({
    where: { model_type: String.raw`App\Models\User`, model_id: id },
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
