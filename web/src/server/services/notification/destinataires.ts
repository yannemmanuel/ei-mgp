import { prisma } from '@/lib/prisma'
import type { ParcoursCode } from '@/server/authz'
import type { Destinataire } from './notification'
import { personnesEnCharge } from '../dossier/suivi-ei'
import { MODELES } from '@/server/modeles'

/**
 * Résolution des destinataires par évènement
 *
 * Séparé du service d'envoi à dessein : « qui reçoit quoi » relève de règles métier propres à
 * chaque évènement, « comment on envoie » est générique.
 */

const MODEL_TYPE_USER = MODELES.utilisateur

/** Utilisateurs ACTIFS portant l'un des rôles donnés. */
export async function utilisateursAvecRoles(roles: readonly string[]): Promise<Destinataire[]> {
  if (roles.length === 0) return []

  const liens = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, roles: { name: { in: [...roles] } } },
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
 * RG-08 / EX-NOT-05 : qui est alerté quand une déclaration est qualifiée critique.
 *
 * ⚠️ LA MATRICE A QUITTÉ LE CODE le 2026-09-21. Elle y était écrite rôle par rôle : un rôle créé
 * depuis l'interface n'y figurait pas, n'était alerté d'aucun circuit accéléré, et rien ne le
 * signalait — ni à l'administrateur, ni à son porteur, qui ne recevait simplement jamais rien.
 * Elle se coche maintenant dans `role_parcours`, à côté des types de déclaration.
 *
 * ⚠️ COCHÉE PAR TYPE, ET C'ÉTAIT INDISPENSABLE. Un booléen posé sur le rôle ne pouvait pas dire
 * « alerté sur les griefs, pas sur les évènements indésirables » — ce que le CDC demande pourtant
 * du Service MGP et de la DG. Croiser un tel booléen avec les types du rôle ajoutait trois
 * destinataires que le métier n'a pas désignés, sur les déclarations les plus sensibles.
 *
 * « Président CSST » reste résolu via l'attribut `poste` et non par un rôle RBAC (DT-07) ;
 * « Service Prévention » et « toutes les Directions » passent par les destinataires
 * supplémentaires du gabarit `circuit_critique` (DT-28), faute de rôle correspondant.
 */
export async function rolesDuCircuitCritique(parcours: ParcoursCode): Promise<string[]> {
  /*
    ⚠️ AUCUN FILTRE SUR `roles.actif`, ET C'EST DÉLIBÉRÉ — contrairement au reste de
    l'autorisation, où un rôle éteint ne confère rien.

    Ce n'est pas un droit qu'on accorde, c'est un courrier qu'on envoie, et les deux erreurs n'ont
    pas le même coût. `secretaire_csst` et `rqse` sont désactivés : les écarter priverait le
    circuit accéléré de l'évènement indésirable de TOUT destinataire par rôle — il ne resterait
    que les directeurs de structure, résolus par leur poste. Un accident grave cesserait d'être
    signalé à ceux qui le recevaient la veille, et personne ne s'en apercevrait avant l'accident
    suivant.

    Le remède est un paramétrage, pas une ligne de code : cocher le circuit sur un rôle actif.
    `santeAdministration()` a vocation à le signaler.
  */
  const lignes = await prisma.role_parcours.findMany({
    where: {
      alerte_circuit_critique: true,
      parcours: { code: parcours },
    },
    select: { roles: { select: { name: true } } },
  })

  return lignes.map((ligne) => ligne.roles.name)
}

export async function destinatairesCircuitCritique(
  parcours: ParcoursCode
): Promise<Destinataire[]> {
  const destinataires = await utilisateursAvecRoles(await rolesDuCircuitCritique(parcours))

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
