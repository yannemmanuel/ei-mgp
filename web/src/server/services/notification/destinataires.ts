import { prisma } from '@/lib/prisma'
import type { ParcoursCode } from '@/server/authz'
import type { Destinataire } from './notification'
import { personnesEnCharge } from '../dossier/suivi-ei'

/**
 * Résolution des destinataires par évènement — port des Listeners Laravel.
 *
 * Séparé du service d'envoi à dessein : « qui reçoit quoi » relève de règles métier propres à
 * chaque évènement, « comment on envoie » est générique.
 */

const MODEL_TYPE_USER = String.raw`App\Models\User`

/** Utilisateurs ACTIFS portant l'un des rôles donnés. */
export async function utilisateursAvecRoles(roles: readonly string[]): Promise<Destinataire[]> {
  if (roles.length === 0) return []

  const liens = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, roles: { name: { in: [...roles] }, guard_name: 'web' } },
    select: { model_id: true },
  })

  if (liens.length === 0) return []

  const utilisateurs = await prisma.users.findMany({
    where: { actif: true, id: { in: liens.map((l) => l.model_id) } },
    select: { id: true, email: true },
  })

  return utilisateurs.map((u) => ({ type: 'utilisateur', id: u.id, email: u.email }))
}

/**
 * RG-08 / EX-NOT-05 : matrice du circuit accéléré, reprise exacte du CDC §6.5
 * (docs/regles-metier.md §C).
 *
 * « Président CSST » est résolu via l'attribut `poste` et non par un rôle RBAC (DT-07) ;
 * « Service Prévention » et « toutes les Directions » passent par les destinataires
 * supplémentaires du gabarit `circuit_critique` (DT-28), faute de rôle correspondant.
 */
const ROLES_CIRCUIT_CRITIQUE: Record<ParcoursCode, readonly string[]> = {
  ei_employe: ['rqse', 'secretaire_csst'],
  grief_employe: ['correspondant_mgp', 'responsable_grief_employe', 'service_mgp', 'dg'],
  grief_sous_traitant: ['correspondant_mgp', 'captage_grief_soustraitant', 'service_mgp', 'dg'],
  grief_communaute: ['service_mgp', 'dg'],
}

export async function destinatairesCircuitCritique(
  parcours: ParcoursCode
): Promise<Destinataire[]> {
  const destinataires = await utilisateursAvecRoles(ROLES_CIRCUIT_CRITIQUE[parcours])

  // EI Employé : « Président CSST (Directeur de structure) » — DT-07.
  if (parcours === 'ei_employe') {
    const directeurs = await prisma.users.findMany({
      where: { poste: 'Directeur de structure', actif: true },
      select: { id: true, email: true },
    })

    const dejaPresents = new Set(
      destinataires.filter((d) => d.type === 'utilisateur').map((d) => String(d.id))
    )

    for (const directeur of directeurs) {
      if (!dejaPresents.has(String(directeur.id))) {
        destinataires.push({ type: 'utilisateur', id: directeur.id, email: directeur.email })
      }
    }
  }

  return destinataires
}

/** Titulaires actifs d'un dossier — destinataires d'une affectation (EX-NOT-01). */
export async function titulairesDuDossier(dossierId: string): Promise<Destinataire[]> {
  const dossier = await prisma.dossiers.findUnique({
    where: { id: dossierId },
    select: {
      site_id: true,
      direction_id: true,
      declarant_user_id: true,
      parcours: { select: { code: true } },
      dossier_affectations: {
        where: { actif: true },
        select: {
          users_dossier_affectations_user_idTousers: {
            select: { id: true, email: true, actif: true },
          },
        },
      },
    },
  })

  if (!dossier) return []

  /*
    ⚠️ DEUX ORIGINES, et la seconde a bien failli manquer.

    Une affectation ACTIVE désigne toujours un titulaire — il n'en est plus écrit de nouvelles
    depuis le 2026-09-20, mais les anciennes valent encore.

    Le reste vient du RATTACHEMENT : plus aucune déclaration n'étant affectée, s'en tenir aux
    affectations aurait fait qu'aucun titulaire n'est prévenu d'une nouvelle déclaration. Personne
    n'aurait rien reçu, et rien ne l'aurait dit.
  */
  const parAffectation = dossier.dossier_affectations
    .map((a) => a.users_dossier_affectations_user_idTousers)
    .filter((u) => u.actif)

  const parRattachement = await personnesEnCharge({
    parcoursCode: dossier.parcours.code as ParcoursCode,
    siteId: dossier.site_id,
    directionId: dossier.direction_id,
    // DT-06 : le déclarant n'instruit pas son dossier, il n'a donc pas à en être averti comme
    // titulaire. Il reçoit, lui, les notifications de DÉCLARANT.
    declarantUserId: dossier.declarant_user_id,
  })

  const adresses = await prisma.users.findMany({
    where: { id: { in: parRattachement.map((p) => p.id) }, actif: true },
    select: { id: true, email: true },
  })

  // Dédupliqué : un compte peut porter une ancienne affectation ET répondre par son rattachement.
  const parId = new Map<bigint, { id: bigint; email: string }>()
  for (const u of [...parAffectation, ...adresses]) parId.set(u.id, { id: u.id, email: u.email })

  return [...parId.values()].map((u) => ({ type: 'utilisateur' as const, id: u.id, email: u.email }))
}

/**
 * EX-NOT-02 : le déclarant n'est notifié que s'il est IDENTIFIÉ.
 *
 * Un dossier anonyme n'a par construction ni compte rattaché ni adresse (RG-06) : il n'y a
 * personne à notifier, et le déclarant suit son dossier par `/suivi`.
 */
export async function declarantIdentifie(dossierId: string): Promise<Destinataire[]> {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: {
      is_anonymous: true,
      users: { select: { id: true, email: true, actif: true } },
    },
  })

  if (dossier.is_anonymous || !dossier.users?.actif) return []

  return [{ type: 'utilisateur', id: dossier.users.id, email: dossier.users.email }]
}

/**
 * EX-NOT-04 : chaîne d'escalade en cas de dépassement d'échéance.
 * N+1 des titulaires, puis Service MGP, puis Direction au-delà de +50 %.
 */
export async function responsablesHierarchiques(dossierId: string): Promise<Destinataire[]> {
  const affectations = await prisma.dossier_affectations.findMany({
    where: { dossier_id: dossierId, actif: true },
    select: {
      users_dossier_affectations_user_idTousers: {
        select: { users: { select: { id: true, email: true, actif: true } } },
      },
    },
  })

  const parId = new Map<string, Destinataire>()

  for (const a of affectations) {
    const n1 = a.users_dossier_affectations_user_idTousers.users
    if (n1?.actif) {
      parId.set(String(n1.id), { type: 'utilisateur', id: n1.id, email: n1.email })
    }
  }

  return [...parId.values()]
}
