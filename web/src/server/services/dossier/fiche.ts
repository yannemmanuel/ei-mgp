import { prisma } from '@/lib/prisma'
import { peutVoirDossier, type UtilisateurAutorise } from '@/server/authz'
import type { ParcoursCode } from '@/server/authz'
import type { StatutCode } from './statuts'

/**
 * Chargement d'une fiche dossier — port de `App\Livewire\Dossiers\DossierDetailPage`.
 *
 * L'autorisation est vérifiée ICI, à la source : une page qui chargerait le dossier avant de
 * vérifier l'accès aurait déjà lu la donnée. Retourne `null` si l'utilisateur n'y a pas droit,
 * sans distinguer « inexistant » de « interdit » — sur un dispositif de signalement, cette
 * distinction révèle l'existence d'un dossier.
 */

/**
 * L'accès « sans données nominatives » (docs/acteurs.md) : voir les dossiers de son périmètre,
 * jamais l'identité du déclarant.
 *
 * ⚠️ SE COCHE SUR LE RÔLE depuis le 2026-09-21. Cette fonction nommait `comite_ethique` : tout
 * autre rôle créé pour la même raison voyait les identités, et rien ne le disait.
 */
export function peutVoirIdentite(u: UtilisateurAutorise): boolean {
  return u.voitIdentiteDeclarant
}

export async function chargerFiche(u: UtilisateurAutorise, dossierId: string) {
  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      reference: true,
      description: true,
      lieu: true,
      date_survenance: true,
      attentes_declarant: true,
      caractere_repetitif: true,
      proposition_mesure_corrective: true,
      categorie_autre_precision: true,
      /*
        Tout ce que la déclaration a collecté sur `dossiers`.

        ⚠️ Ces colonnes existaient déjà pour la plupart, mais n'étaient ni chargées ni affichées :
        la ville d'un riverain — obligatoire —, l'entreprise d'un sous-traitant, le poste. Le
        formulaire les demandait, la base les gardait, et la fiche n'en montrait rien. Une
        information qu'on exige d'un déclarant sans jamais la relire n'aurait pas dû être demandée.
      */
      entreprise: true,
      poste: true,
      poste_precision: true,
      ville: true,
      precision_localisation: true,
      statut_plaignant: true,
      statut_plaignant_precision: true,
      declarant_est_victime: true,
      poste_declarant: true,
      poste_declarant_precision: true,
      synthese_resolution: true,
      motif_reouverture: true,
      motif_rejet: true,
      date_cloture: true,
      contentieux: true,
      is_anonymous: true,
      declarant_user_id: true,
      created_at: true,
      site_id: true,
      // La famille de risque, posée au traitement. Le libellé accompagne l'identifiant : la fiche
      // l'affiche, et le panneau d'actions a besoin de l'identifiant pour rouvrir le bon choix.
      famille_risque_id: true,
      familles_risque: { select: { libelle: true } },
      // ⚠️ La direction CONCERNÉE : elle borne les comptes habilités sur une seule
      // direction (`directionCloisonnante()`), et pas seulement sur un site.
      direction_id: true,
      parcours: { select: { id: true, code: true, libelle: true } },
      // Les deux rattachements, nommés. `directions` est celui des FAITS — c'est de lui que
      // découle le site ; l'autre est celui du déclarant quand il n'est pas la personne concernée.
      directions: { select: { libelle: true } },
      directions_dossiers_direction_declarant_idTodirections: { select: { libelle: true } },
      categories: { select: { libelle: true } },
      niveaux_gravite: { select: { libelle: true, niveau: true, couleur: true } },
      statuts_dossier: { select: { id: true, code: true, libelle_interne: true } },
      declaration_identites: true,
      // Affectation du LECTEUR, chargée dans la même requête : `dossiers.view.own` en dépend, et
      // un aller-retour de plus par consultation de fiche ne se justifierait pas.
      dossier_affectations: {
        where: { user_id: u.id, actif: true },
        select: { id: true },
        take: 1,
      },
      // Les pièces jointes sont polymorphes : Prisma n'en a AUCUNE relation vers `dossiers`
      // (cf. MIGRATION_PLAN.md, risque 3). Elles se chargent séparément, par
      // `piecesJointesDossier()`.
    },
  })

  if (!dossier) return null

  const autorise = peutVoirDossier(u, {
    parcoursCode: dossier.parcours.code as ParcoursCode,
    statutCode: dossier.statuts_dossier.code as StatutCode,
    isAnonymous: dossier.is_anonymous,
    declarantUserId: dossier.declarant_user_id,
    siteId: dossier.site_id,
    directionId: dossier.direction_id,
    estAffecteAuLecteur: dossier.dossier_affectations.length > 0,
  })

  if (!autorise) return null

  return {
    ...dossier,
    statutCode: dossier.statuts_dossier.code as StatutCode,
    estAffecteAuLecteur: dossier.dossier_affectations.length > 0,
    // L'identité est retirée de l'objet retourné, pas seulement masquée à l'affichage : ce qui
    // n'est pas envoyé au composant ne peut pas fuiter par inadvertance.
    declaration_identites: peutVoirIdentite(u) ? dossier.declaration_identites : null,
    identiteMasquee: !peutVoirIdentite(u) && !dossier.is_anonymous,
  }
}

/** Frise chronologique du dossier (RG-04). */
export async function historiqueDossier(dossierId: string) {
  return prisma.historique_statuts.findMany({
    where: { dossier_id: dossierId },
    // Tri par `id` : `created_at` est en timestamp(0), donc à la seconde près — plusieurs
    // transitions de la même seconde seraient départagées arbitrairement.
    orderBy: { id: 'desc' },
    select: {
      id: true,
      commentaire: true,
      created_at: true,
      users: { select: { name: true } },
      statuts_dossier_historique_statuts_statut_suivant_idTostatuts_dossier: {
        select: { libelle_interne: true },
      },
    },
  })
}

export async function affectationsActives(dossierId: string) {
  return prisma.dossier_affectations.findMany({
    where: { dossier_id: dossierId, actif: true },
    select: {
      id: true,
      motif: true,
      affecte_le: true,
      users_dossier_affectations_user_idTousers: { select: { id: true, name: true } },
    },
  })
}

export async function piecesJointesDossier(dossierId: string) {
  return prisma.pieces_jointes.findMany({
    where: { attachable_type: String.raw`App\Models\Dossier`, attachable_id: dossierId },
    orderBy: { created_at: 'asc' },
    select: { id: true, nom_original: true, taille_octets: true, mime_type: true },
  })
}
