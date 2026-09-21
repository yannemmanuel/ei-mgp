import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import {
  peutVoirParcours,
  rattachementCouvre,
  type ParcoursCode,
  type Permission,
  type PourCloisonnement,
  type Role,
  cloisonnePourSesRoles,
  donneAccesAuxDossiers,
} from '@/server/authz'
import { genererCodeAcces, hacherCodeAcces } from './code-acces'
import { stockerFichiers, verifierLot, type FichierAValider } from './pieces-jointes'
import { referenceSuivante } from './reference'
import { surAffectation, surDeclarationCritique } from '../notification/evenements'

/**
 * Orchestration de la création d'un dossier de bout en bout — port de
 * `App\Services\Declaration\DeclarationService::creer()`.
 *
 * POINT D'ENTRÉE UNIQUE de la création d'une déclaration. Aucune page, aucune Server Action ne
 * doit écrire dans `dossiers` directement : c'est la seule garantie que référence, code d'accès,
 * historique, affectation automatique et anonymat sont systématiquement appliqués ensemble.
 */

/**
 * Rôles auto-affectés au captage selon le parcours (CDC §5.1/§5.2, EX-GES-02).
 *
 * ⚠️ L'ÉVÈNEMENT INDÉSIRABLE N'EST PLUS AFFECTÉ — liste vide, et c'est une décision, pas un oubli.
 *
 * Son traitement revient au chargé de sécurité du site, qui complète le dossier après chaque
 * comité. Il voit tous les évènements de son site par le cloisonnement (`authz/site.ts`) et n'a
 * besoin d'aucune affectation pour cela : en créer une n'aurait nommé qu'un responsable de plus
 * dans un circuit qui n'en demande pas, et lui en aurait masqué d'autres dans « mes dossiers ».
 *
 * Conséquence assumée : un évènement indésirable reste au statut « reçu » à sa création. Il
 * n'est pas en attente d'un destinataire — il attend d'être traité par qui le voit déjà.
 */
/**
 * ⚠️ PLUS AUCUNE DÉCLARATION N'EST AFFECTÉE — les quatre listes sont vides.
 *
 * L'évènement indésirable avait cessé de l'être le premier ; la même logique vaut pour les griefs
 * depuis le 2026-09-20, le circuit des EI ayant fait ses preuves. Une déclaration revient
 * désormais à tous ceux dont l'habilitation de rôle ouvre ce type ET dont le rattachement couvre
 * le dossier. Il n'y a plus de destinataire nommé à la création.
 *
 * ⚠️ LA TABLE RESTE, ET LA FONCTION AUSSI. `dossier_affectations` porte les affectations déjà
 * écrites, que « mes dossiers » continue de lire ; et rendre la liste non vide suffit à remettre
 * un parcours sous affectation automatique, sans rien réécrire.
 */
const ROLES_AFFECTATION_AUTOMATIQUE: Record<ParcoursCode, readonly string[]> = {
  ei_employe: [],
  grief_employe: [],
  grief_sous_traitant: [],
  grief_communaute: [],
}

/** `String.raw` obligatoire : en littéral classique, `\M` et `\U` seraient supprimés. */
const MODEL_TYPE_USER = String.raw`App\Models\User`
const MODEL_TYPE_DOSSIER = String.raw`App\Models\Dossier`

export type DonneesDossier = {
  categorieId: bigint
  /**
   * Nulle tant que la gravité n'est pas qualifiée.
   *
   * L'évènement indésirable ne la demande plus au déclarant (EI8) : elle est renseignée au
   * traitement. ⚠️ Le circuit accéléré (RG-08) ne peut donc plus se décider ici pour ces
   * dossiers — il se déclenche à la qualification, dans `qualifierGravite()`.
   */
  niveauGraviteId: bigint | null
  description: string
  lieu?: string | null
  dateSurvenance?: Date | null
  attentesDeclarant?: string | null
  categorieAutrePrecision?: string | null
  declarantUserId?: bigint | null
  siteId?: bigint | null
  directionId?: bigint | null
  caractereRepetitif?: string | null
  propositionMesureCorrective?: string | null
  /**
   * Le déclarant parle-t-il pour lui-même ?
   *
   * ⚠️ Trois états, pas deux. `null` n'est PAS « non » : il désigne les déclarations antérieures à
   * ce champ, à qui la question n'a jamais été posée. Les confondre ferait passer 37 dossiers
   * pour des signalements déposés par des tiers.
   */
  declarantEstVictime?: boolean | null
  /**
   * Exigés même en anonyme, donc stockés sur le dossier et non dans `declaration_identites`.
   *
   * Cette table n'est pas créée quand l'anonymat est coché : une entreprise ou une ville rangée
   * là aurait été demandée à l'écran puis perdue, sans le moindre signal.
   */
  entreprise?: string | null
  /**
   * Poste occupé, choisi dans le référentiel et rattaché à la direction du dossier.
   *
   * Sur `dossiers` et non dans `declaration_identites` : le retour métier du 11/09 demande de
   * pouvoir le choisir EN ANONYME, or cette table n'est pas créée dans ce cas.
   */
  poste?: string | null
  /** Poste saisi à la main quand « Autre » est retenu. */
  postePrecision?: string | null
  /**
   * Rattachement du DÉCLARANT, renseigné seulement s'il n'est pas la personne concernée.
   *
   * ⚠️ Ne détermine PAS le site du dossier : c'est `directionId`, la direction CONCERNÉE par
   * les faits, qui l'établit. Router sur la direction d'un témoin enverrait le signalement à un
   * service étranger à l'évènement.
   */
  directionDeclarantId?: bigint | null
  posteDeclarant?: string | null
  posteDeclarantPrecision?: string | null
  /**
   * Qualité du plaignant, et sa précision si « autre ».
   *
   * ⚠️ Sur `dossiers`, jamais dans `declaration_identites` : la question est posée MÊME en
   * anonymat — elle qualifie la plainte, pas la personne — et cette table n'est pas créée dans
   * ce cas. L'y laisser revenait à exiger une réponse à l'écran puis à la jeter.
   */
  statutPlaignant?: string | null
  statutPlaignantPrecision?: string | null
  ville?: string | null
  precisionLocalisation?: string | null
}

/** Champs de `declaration_identites`. Ignorés si la déclaration est anonyme (RG-06). */
export type DonneesIdentite = {
  nomPrenom?: string | null
  matricule?: string | null
  entreprise?: string | null
  fonction?: string | null
  ancienneteAnnees?: number | null
  /** Tranche choisie dans le référentiel (GE1). `ancienneteAnnees` reste pour l'historique. */
  ancienneteTranche?: string | null
  localite?: string | null
  statutPlaignant?: string | null
  contactEmail?: string | null
  contactTelephone?: string | null
  souhaitRecontact?: boolean | null
  canalRetourPrefere?: string | null
  personnesImpliquees?: string | null
  temoins?: string | null
  consentementRgpd?: boolean | null
}

export type ResultatDeclaration = {
  readonly dossierId: string
  readonly reference: string
  readonly codeAcces: string
  /** RG-08 : vrai si le circuit accéléré doit être déclenché EN SYNCHRONE (étape 9). */
  readonly estCritique: boolean
}

type ClientTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function creerDeclaration(params: {
  parcours: ParcoursCode
  canalCaptageCode: string
  anonyme: boolean
  donneesDossier: DonneesDossier
  donneesIdentite?: DonneesIdentite
  fichiers?: readonly FichierAValider[]
  televersePar?: bigint | null
}): Promise<ResultatDeclaration> {
  const fichiers = params.fichiers ?? []

  // Validé AVANT la transaction : un lot rejeté ne doit jamais laisser un dossier créé sans ses
  // pièces jointes (même ordre que le service Laravel).
  await verifierLot(fichiers)

  const codeAccesClair = genererCodeAcces()
  const accessCodeHash = await hacherCodeAcces(codeAccesClair)

  const resultat = await prisma.$transaction(async (tx) => {
    const [parcours, statutRecu, canal] = await Promise.all([
      tx.parcours.findFirstOrThrow({ where: { code: params.parcours } }),
      tx.statuts_dossier.findFirstOrThrow({ where: { code: 'recu' } }),
      tx.canaux_captage.findFirstOrThrow({ where: { code: params.canalCaptageCode } }),
    ])

    const reference = await referenceSuivante(tx, params.parcours)
    const d = params.donneesDossier
    const maintenant = new Date()

    const dossier = await tx.dossiers.create({
      data: {
        id: ulid().toLowerCase(),
        reference,
        parcours_id: parcours.id,
        categorie_id: d.categorieId,
        categorie_autre_precision: d.categorieAutrePrecision ?? null,
        niveau_gravite_id: d.niveauGraviteId,
        entreprise: d.entreprise ?? null,
        poste: d.poste ?? null,
        poste_precision: d.postePrecision ?? null,
        direction_declarant_id: d.directionDeclarantId ?? null,
        poste_declarant: d.posteDeclarant ?? null,
        poste_declarant_precision: d.posteDeclarantPrecision ?? null,
        statut_plaignant: d.statutPlaignant ?? null,
        statut_plaignant_precision: d.statutPlaignantPrecision ?? null,
        ville: d.ville ?? null,
        precision_localisation: d.precisionLocalisation ?? null,
        statut_id: statutRecu.id,
        canal_captage_id: canal.id,
        is_anonymous: params.anonyme,
        // EX-NOT-06 : la page de suivi exige référence + code d'accès, anonyme ou non — RG-02 ne
        // couvrait que le cas anonyme, généralisé en DT-28 pour une clé secondaire uniforme.
        access_code_hash: accessCodeHash,
        // Le site n'est pas saisi : il DÉCOULE de la direction (un site regroupe une ou plusieurs
        // directions). Le déduire ici plutôt que de le demander évite deux informations à tenir
        // cohérentes, et une contradiction entre elles qu'aucun écran ne saurait arbitrer.
        // `siteId` reste accepté pour les appels qui le connaissent déjà (reprise, tests).
        site_id: d.siteId ?? (await siteDeLaDirection(tx, d.directionId ?? null)),
        direction_id: d.directionId ?? null,
        // RG-06 : une déclaration anonyme n'est JAMAIS rattachée à un compte, même si le
        // déclarant était connecté au moment du dépôt.
        declarant_user_id: params.anonyme ? null : (d.declarantUserId ?? null),
        description: d.description,
        lieu: d.lieu ?? null,
        date_survenance: d.dateSurvenance ?? null,
        attentes_declarant: d.attentesDeclarant ?? null,
        caractere_repetitif: d.caractereRepetitif ?? null,
        proposition_mesure_corrective: d.propositionMesureCorrective ?? null,
        // `?? null` et non `?? false` : une question non posée reste sans réponse.
        declarant_est_victime: d.declarantEstVictime ?? null,
        created_at: maintenant,
        updated_at: maintenant,
      },
      select: { id: true, reference: true, categorie_id: true },
    })

    // RG-06 : la ligne d'identité n'est PAS créée pour une déclaration anonyme. La garantie est
    // structurelle — la donnée n'existe nulle part —, pas seulement un masquage à l'affichage.
    const identite = params.donneesIdentite
    const identiteRenseignee =
      identite !== undefined && Object.values(identite).some((v) => v !== null && v !== undefined)

    if (!params.anonyme && identiteRenseignee) {
      await tx.declaration_identites.create({
        data: {
          dossier_id: dossier.id,
          nom_prenom: identite.nomPrenom ?? null,
          matricule: identite.matricule ?? null,
          entreprise: identite.entreprise ?? null,
          fonction: identite.fonction ?? null,
          anciennete_annees: identite.ancienneteAnnees ?? null,
          anciennete_tranche: identite.ancienneteTranche ?? null,
          localite: identite.localite ?? null,
          statut_plaignant: identite.statutPlaignant ?? null,
          contact_email: identite.contactEmail ?? null,
          contact_telephone: identite.contactTelephone ?? null,
          souhait_recontact: identite.souhaitRecontact ?? null,
          canal_retour_prefere: identite.canalRetourPrefere ?? null,
          personnes_impliquees: identite.personnesImpliquees ?? null,
          temoins: identite.temoins ?? null,
          consentement_rgpd: identite.consentementRgpd ?? null,
          created_at: maintenant,
          updated_at: maintenant,
        },
      })
    }

    if (fichiers.length > 0) {
      const preparees = await stockerFichiers(fichiers, MODEL_TYPE_DOSSIER, dossier.id)

      await tx.pieces_jointes.createMany({
        data: preparees.map((p) => ({
          id: p.id,
          attachable_type: MODEL_TYPE_DOSSIER,
          attachable_id: dossier.id,
          disque: p.disque,
          chemin: p.chemin,
          nom_original: p.nomOriginal,
          mime_type: p.mimeType,
          taille_octets: BigInt(p.tailleOctets),
          checksum_sha256: p.checksumSha256,
          televerse_par: params.televersePar ?? null,
          created_at: maintenant,
        })),
      })
    }

    // RG-04 : historique append-only, dès la première transition.
    await tx.historique_statuts.create({
      data: {
        dossier_id: dossier.id,
        statut_precedent_id: null,
        statut_suivant_id: statutRecu.id,
        commentaire: 'Déclaration reçue.',
        effectue_par: null,
        created_at: maintenant,
      },
    })

    /*
      ⚠️ AFFECTER NE CHANGE PLUS LE STATUT — « Affecté » a quitté le circuit le 2026-09-21.

      Une déclaration reste à « Reçu » jusqu'à ce que quelqu'un l'analyse, quel que soit le type.
      C'est l'état dans lequel elle attend d'être traitée, et non l'attente d'un destinataire :
      elle revient déjà à tous ceux dont l'habilitation ouvre ce type et dont le rattachement la
      couvre.

      L'appel SUBSISTE, et la fonction aussi : elle écrit `dossier_affectations` et prévient les
      titulaires (EX-NOT-01). Rendre non vide l'une des quatre listes de
      `ROLES_AFFECTATION_AUTOMATIQUE` suffit donc à remettre un type sous affectation automatique
      — ce qui lui nommera des destinataires, sans pour autant lui inventer un état de plus.
    */
    await affecterAutomatiquement(tx, dossier.id, dossier.categorie_id, params.parcours)

    /*
      Sans gravité, aucun circuit accéléré à la création — et c'est voulu.

      L'évènement indésirable n'en porte plus au dépôt (EI8). Le déclenchement de RG-08 se
      reporte alors sur `qualifierGravite()`, au moment où quelqu'un qui connaît l'échelle la
      renseigne. Présumer « non critique » ici serait faux ; présumer « critique » alerterait la
      Direction à chaque signalement. On ne présume rien : on attend de savoir.
    */
    const gravite =
      d.niveauGraviteId === null
        ? null
        : await tx.niveaux_gravite.findUniqueOrThrow({
            where: { id: d.niveauGraviteId },
            select: { effet_circuit: true },
          })

    /*
      ⚠️ `aEteAffecte` A ÉTÉ RETIRÉ DU RETOUR le 2026-09-21, avec le statut « Affecté ».

      Il valait `false` depuis le 2026-09-20 — plus aucun type n'étant affecté automatiquement —
      et aucun appelant ne le lisait : vérifié dans tout `src`, il n'avait plus un seul lecteur.
      Un drapeau toujours faux que personne ne consulte finit par être cru sur parole par le
      prochain à le lire.
    */
    return {
      dossierId: dossier.id,
      reference: dossier.reference,
      estCritique: gravite?.effet_circuit === 'accelere',
    }
  })

  /*
    EX-NOT-01 : les titulaires sont prévenus de ce qui leur est confié.

    ⚠️ CET APPEL A FAILLI SE PERDRE DEUX FOIS. Il vivait d'abord dans la réaffectation manuelle,
    supprimée ; reporté ici, il était conditionné à `aEteAffecte`, et cette condition n'est plus
    jamais vraie depuis que plus aucune déclaration n'est affectée (2026-09-20). Aucun titulaire
    n'aurait plus été prévenu d'une nouvelle déclaration, et rien ne l'aurait signalé.

    ⚠️ APPEL INCONDITIONNEL désormais. Les destinataires se déduisent du rattachement — voir
    `titulairesDuDossier()` — et la fonction ne fait rien quand il n'y en a aucun.

    Comme RG-08 ci-dessous : APRÈS le commit. Notifier depuis l'intérieur de la transaction
    enverrait des messages pour un dossier qui pourrait encore être annulé.
  */
  await surAffectation(resultat.dossierId)

  // RG-08 : circuit accéléré déclenché EN SYNCHRONE, après commit — notifier depuis l'intérieur
  // de la transaction enverrait des messages pour un dossier qui pourrait encore être annulé.
  if (resultat.estCritique) {
    await surDeclarationCritique(resultat.dossierId, params.parcours)
  }

  return { ...resultat, codeAcces: codeAccesClair }
}

/**
 * Site auquel appartient une direction.
 *
 * Renvoie `null` si la direction est inconnue ou n'est rattachée à aucun site. Un dossier sans
 * site n'est visible que des rôles transverses : c'est le comportement décidé, et l'écran
 * d'administration des directions signale celles qui restent orphelines.
 */
async function siteDeLaDirection(
  tx: ClientTransaction,
  directionId: bigint | null
): Promise<bigint | null> {
  if (directionId === null) return null

  const direction = await tx.directions.findUnique({
    where: { id: directionId },
    select: { site_id: true },
  })

  return direction?.site_id ?? null
}

/**
 * EX-GES-02 : affectation automatique aux rôles de captage du parcours.
 *
 * RG-09 : une déclaration catégorisée « Autre » est orientée par défaut vers le Service
 * MGP/DADD — elle n'entre par définition dans aucune catégorie métier, seul un rôle transverse
 * peut la requalifier. Le délai suivi reste celui du parcours d'origine (RGI-13), garanti
 * structurellement par l'indexation de `sla_delais` sur le parcours seul.
 *
 * Tous les utilisateurs actifs portant le rôle sont affectés : le CDC ne borne pas leur nombre
 * et ne décrit aucun algorithme de répartition, qu'il serait donc arbitraire d'inventer.
 *
 * ⚠️ Mais porter le rôle ne suffit plus : depuis que le parcours se confie personne par personne,
 * seuls les comptes RÉELLEMENT habilités sur ce parcours sont affectés. Sans ce filtre, le
 * dossier serait confié à quelqu'un dont le périmètre l'empêche de l'ouvrir — affecté et
 * introuvable à la fois, ce qui est pire que non affecté : personne ne le réclamerait.
 *
 * Conséquence à connaître : tant qu'aucun compte n'est habilité sur un parcours, ses déclarations
 * restent au statut « reçu », sans destinataire. C'est visible — le tableau de bord compte les
 * dossiers non affectés — là où une affectation à un aveugle ne l'était pas.
 */
async function affecterAutomatiquement(
  tx: ClientTransaction,
  dossierId: string,
  categorieId: bigint,
  parcours: ParcoursCode
): Promise<boolean> {
  const categorie = await tx.categories.findUniqueOrThrow({
    where: { id: categorieId },
    select: { is_autre: true },
  })

  const roles = categorie.is_autre ? ['service_mgp'] : ROLES_AFFECTATION_AUTOMATIQUE[parcours]

  const liens = await tx.model_has_roles.findMany({
    where: {
      model_type: MODEL_TYPE_USER,
      roles: { name: { in: [...roles] }, guard_name: 'web' },
    },
    select: { model_id: true },
  })

  if (liens.length === 0) {
    return false
  }

  const candidats = await tx.users.findMany({
    where: { actif: true, id: { in: liens.map((l) => l.model_id) } },
    select: {
      id: true,
      site_id: true,
      // La direction de rattachement : un compte habilité sur une seule direction ne reçoit que
      // les déclarations de celle-ci.
      direction_id: true,
      // Le site de sa direction : un compte rattaché à une direction appartient à son site.
      directions: { select: { site_id: true } },
    },
  })

  /*
    TOUS les rôles de chaque candidat, pas seulement celui du captage.

    `model_has_roles` est la table polymorphe de spatie : reliée par `model_id` + `model_type`,
    elle n'est pas une relation Prisma et se lit à part. Elle est nécessaire ici parce qu'un rôle
    transverse dispense d'attribution — le lire depuis `liens`, filtré sur les rôles de captage,
    ne le montrerait jamais.
  */
  const tousLesLiens = await tx.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: candidats.map((c) => c.id) } },
    select: {
      model_id: true,
      roles: {
        select: {
          name: true,
          actif: true,
          guard_name: true,
          // ⚠️ Les PERMISSIONS aussi : `directionCloisonnante()` et `siteCloisonnant()` laissent
          // passer `dossiers.view.all`. Sans elles, un rôle transverse serait borné ici alors
          // qu'il ne l'est pas en lecture — et l'affectation cesserait de suivre l'accès.
          role_has_permissions: {
            select: { permissions: { select: { name: true, guard_name: true } } },
          },
          /*
            ⚠️ LES TYPES DE DÉCLARATION VIENNENT DU RÔLE, plus de l'attribution par personne.

            Ce filtre lisait `utilisateur_parcours`, la table d'attribution individuelle — qui
            n'entre plus dans aucune décision depuis le 2026-09-20 et n'est plus tenue à jour.
            L'affectation automatique aurait donc suivi un périmètre différent de celui de la
            lecture, sur la seule table que plus personne ne regarde.
          */
          role_parcours: {
            where: { parcours: { actif: true } },
            select: { parcours: { select: { code: true } } },
          },
          // Borné à son site ou à sa direction ? Paramètre du rôle, coché dans les habilitations.
          cloisonne_par_rattachement: true,
        },
      },
    },
  })

  const rolesParCompte = new Map<bigint, Role[]>()
  const permissionsParCompte = new Map<bigint, Set<Permission>>()
  const parcoursParCompte = new Map<bigint, Set<ParcoursCode>>()
  /*
    ⚠️ UN RÔLE À LA FOIS, puis la règle au bout : le compte n'est borné que si TOUS ses rôles
    porteurs d'accès le prévoient — voir `cloisonnePourSesRoles()`.
  */
  const cloisonnementParCompte = new Map<bigint, { cloisonne: boolean; donneAcces: boolean }[]>()

  for (const lien of tousLesLiens) {
    // Un rôle désactivé ne confère rien, exactement comme dans `chargerUtilisateurAutorise()`.
    if (!lien.roles.actif || lien.roles.guard_name !== 'web') continue

    rolesParCompte.set(lien.model_id, [
      ...(rolesParCompte.get(lien.model_id) ?? []),
      lien.roles.name as Role,
    ])

    const permissions = permissionsParCompte.get(lien.model_id) ?? new Set<Permission>()
    for (const rhp of lien.roles.role_has_permissions) {
      if (rhp.permissions.guard_name === 'web') permissions.add(rhp.permissions.name as Permission)
    }
    permissionsParCompte.set(lien.model_id, permissions)

    const ouverts = parcoursParCompte.get(lien.model_id) ?? new Set<ParcoursCode>()
    for (const rp of lien.roles.role_parcours) ouverts.add(rp.parcours.code as ParcoursCode)
    parcoursParCompte.set(lien.model_id, ouverts)

    // Même lecture que `chargerUtilisateurAutorise()`, règle du cumul comprise.
    cloisonnementParCompte.set(lien.model_id, [
      ...(cloisonnementParCompte.get(lien.model_id) ?? []),
      {
        cloisonne: lien.roles.cloisonne_par_rattachement,
        donneAcces: donneAccesAuxDossiers(
          lien.roles.role_has_permissions
            .filter((rhp) => rhp.permissions.guard_name === 'web')
            .map((rhp) => rhp.permissions.name)
        ),
      },
    ])
  }

  // Filtré par la MÊME fonction que celle qui décide de l'accès en lecture. Recopier la règle ici
  // la ferait diverger au premier ajustement, et l'écart ne se verrait que sur un dossier perdu.
  const surLeParcours = candidats.filter((u) =>
    peutVoirParcours(
      {
        roles: rolesParCompte.get(u.id) ?? [],
        parcours: [...(parcoursParCompte.get(u.id) ?? [])],
      },
      parcours
    )
  )

  /*
    ⚠️ ET DU MÊME RATTACHEMENT que le dossier. C'est la seconde moitié de la règle métier :
    l'affectation suit le formulaire ET le rattachement.

    « On peut être habilité sur un site, c'est-à-dire plusieurs directions à la fois, ou sur une
    seule direction. Dans ce cas, on ne reçoit que les déclarations de la direction sur laquelle
    on est habilité. »

    Sans ce filtre, une déclaration déposée sur un site était confiée à tous les correspondants
    de tous les sites — chacun la voyait dans « ses » dossiers, et personne ne savait qui la
    traitait. Le cloisonnement en lecture la leur masquait ensuite, si bien qu'ils étaient
    affectés à un dossier qu'ils ne pouvaient pas ouvrir.

    ⚠️ LES MÊMES FONCTIONS que celles qui décident de l'accès en lecture, et non une règle
    recopiée. La version précédente redérivait le site à la main et affectait à TOUT LE MONDE un
    dossier sans site (`siteDuDossier === null`) — or `peutVoirDossier()` le refuse justement à
    tout compte borné. Elle reproduisait donc exactement le défaut qu'elle prétendait corriger :
    des comptes affectés à des dossiers qu'ils ne peuvent pas ouvrir.
  */
  const {
    site_id: siteDuDossier,
    direction_id: directionDuDossier,
    declarant_user_id: declarantId,
  } = await tx.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { site_id: true, direction_id: true, declarant_user_id: true },
  })

  const utilisateurs = surLeParcours.filter((u) => {
    /*
      DT-06 : le DÉCLARANT identifié n'est jamais affecté à son propre dossier.

      ⚠️ Cette règle ne vivait que dans la réaffectation manuelle, qui vient d'être supprimée.
      Sans ce filtre elle disparaîtrait avec elle — et un correspondant qui déclare un grief se
      verrait confier l'instruction de son propre signalement. Le retrait d'une fonction ne doit
      pas emporter une garantie qui ne s'y trouvait que par accident.

      Ne concerne que les déclarations IDENTIFIÉES : une déclaration anonyme n'est rattachée à
      aucun compte (RG-06), et `declarant_user_id` y est nul.
    */
    if (declarantId !== null && u.id === declarantId) return false

    // La photographie d'autorisation du candidat, dans la forme qu'attendent les fonctions de
    // cloisonnement. `siteId` est déduit de la direction comme dans `chargerUtilisateurAutorise()`.
    const pourCloisonnement = {
      siteId: u.site_id ?? u.directions?.site_id ?? null,
      directionId: u.direction_id,
      permissions: permissionsParCompte.get(u.id) ?? new Set<Permission>(),
      cloisonneParRattachement: cloisonnePourSesRoles(cloisonnementParCompte.get(u.id) ?? []),
    } satisfies PourCloisonnement

    return rattachementCouvre(pourCloisonnement, {
      siteId: siteDuDossier,
      directionId: directionDuDossier,
    })
  })

  if (utilisateurs.length === 0) {
    return false
  }

  const maintenant = new Date()

  await tx.dossier_affectations.createMany({
    data: utilisateurs.map((u) => ({
      dossier_id: dossierId,
      user_id: u.id,
      affecte_par: null,
      type: 'automatique',
      actif: true,
      affecte_le: maintenant,
      created_at: maintenant,
      updated_at: maintenant,
    })),
  })

  return true
}
