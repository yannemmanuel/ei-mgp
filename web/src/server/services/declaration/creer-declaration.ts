import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import type { ParcoursCode } from '@/server/authz'
import { genererCodeAcces, hacherCodeAcces } from './code-acces'
import { stockerFichiers, verifierLot, type FichierAValider } from './pieces-jointes'
import { referenceSuivante } from './reference'
import { surDeclarationCritique } from '../notification/evenements'

/**
 * Orchestration de la création d'un dossier de bout en bout — port de
 * `App\Services\Declaration\DeclarationService::creer()`.
 *
 * POINT D'ENTRÉE UNIQUE de la création d'une déclaration. Aucune page, aucune Server Action ne
 * doit écrire dans `dossiers` directement : c'est la seule garantie que référence, code d'accès,
 * historique, affectation automatique et anonymat sont systématiquement appliqués ensemble.
 */

/** Rôles auto-affectés au captage selon le parcours (CDC §5.1/§5.2, EX-GES-02). */
const ROLES_AFFECTATION_AUTOMATIQUE: Record<ParcoursCode, readonly string[]> = {
  ei_employe: ['secretaire_csst', 'rqse'],
  grief_employe: ['rgp'],
  grief_sous_traitant: ['captage_grief_soustraitant'],
  grief_communaute: ['captage_grief_communaute'],
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
   * Exigés même en anonyme, donc stockés sur le dossier et non dans `declaration_identites`.
   *
   * Cette table n'est pas créée quand l'anonymat est coché : une entreprise ou une ville rangée
   * là aurait été demandée à l'écran puis perdue, sans le moindre signal.
   */
  entreprise?: string | null
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

    const aEteAffecte = await affecterAutomatiquement(tx, dossier.id, dossier.categorie_id, params.parcours)

    if (aEteAffecte) {
      const statutAffecte = await tx.statuts_dossier.findFirstOrThrow({ where: { code: 'affecte' } })

      await tx.dossiers.update({
        where: { id: dossier.id },
        data: { statut_id: statutAffecte.id, updated_at: new Date() },
      })

      await tx.historique_statuts.create({
        data: {
          dossier_id: dossier.id,
          statut_precedent_id: statutRecu.id,
          statut_suivant_id: statutAffecte.id,
          commentaire: 'Affectation automatique.',
          effectue_par: null,
          created_at: new Date(),
        },
      })
    }

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

    return {
      dossierId: dossier.id,
      reference: dossier.reference,
      estCritique: gravite?.effet_circuit === 'accelere',
    }
  })

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

  const utilisateurs = await tx.users.findMany({
    where: { actif: true, id: { in: liens.map((l) => l.model_id) } },
    select: { id: true },
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
