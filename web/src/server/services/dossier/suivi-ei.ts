import { prisma } from '@/lib/prisma'
import {
  cloisonnePourSesRoles,
  directionCloisonnante,
  donneAccesAuxDossiers,
  PARCOURS_CODES,
  rattachementCouvre,
  siteCloisonnant,
  type ParcoursCode,
  type Permission,
  type PourCloisonnement,
  type Role,
} from '@/server/authz'
import type { StatutAction } from '../action-corrective/action-corrective'
import { MODELES } from '@/server/modeles'

/** `String.raw` obligatoire : en littéral classique, `\M` et `\U` seraient supprimés. */
const MODEL_TYPE_USER = MODELES.utilisateur

/**
 * Ce qu'il faut savoir d'un dossier pour dire qui en répond.
 *
 * ⚠️ Le TYPE en fait partie : la charge se lit « habilité sur ce type, et rattaché à ce site ou
 * à cette direction ». Deux rôles peuvent couvrir le même site sans répondre des mêmes dossiers.
 */
export type RattachementDossier = {
  readonly parcoursCode: ParcoursCode
  readonly siteId: bigint | null
  readonly directionId: bigint | null
  /**
   * Le compte qui a déposé la déclaration, `null` si elle est anonyme.
   *
   * ⚠️ DT-06 : il n'instruit JAMAIS son propre dossier. La règle ne vivait que dans l'affectation
   * automatique ; celle-ci ayant disparu, elle serait partie avec elle — et un correspondant qui
   * déclare un grief en serait devenu le titulaire.
   */
  readonly declarantUserId?: bigint | null
}

/**
 * Qui a la charge d'un évènement indésirable.
 *
 * Il n'est affecté à personne : la charge se déduit du RATTACHEMENT, `dossier_affectations` étant
 * vide pour ce parcours.
 *
 * ⚠️ Renvoie une LISTE, éventuellement vide : rien n'impose qu'un rattachement ait un et un seul
 * chargé de sécurité, et l'écran doit pouvoir dire « personne ».
 *
 * ⚠️ Filtré par `rattachementCouvre()`, la même fonction que l'affectation et la lecture. Les
 * deux filtres écrits à la main qui l'ont précédée se trompaient tous les deux.
 */
/**
 * Un traitant, accompagné de quoi décider s'il répond d'un dossier donné.
 *
 * ⚠️ Volontairement PAS un `UtilisateurAutorise` complet : inventer les champs hors sujet ferait
 * circuler des valeurs fausses — un `etapes: []` répondrait « non » sans lever d'erreur.
 */
export type CompteEnCharge = {
  readonly id: bigint
  readonly nom: string
  readonly pourCloisonnement: PourCloisonnement & {
    readonly roles: readonly Role[]
    readonly parcours: readonly ParcoursCode[]
    readonly traiteLesDossiers: boolean
  }
}

/**
 * Tous les comptes qui TRAITENT des déclarations, chargés une fois.
 *
 * ⚠️ « Traiter » est un paramètre du rôle, jamais déduit de `dossiers.status.update` : le Service
 * MGP porte ce droit sans être traitant.
 *
 * Séparé de `personnesEnCharge()` parce que le tableau de bord pose la question sur beaucoup de
 * dossiers : la liste se charge une fois, puis chacun se décide en mémoire.
 */
export async function comptesQuiTraitent(): Promise<CompteEnCharge[]> {
  const comptes = await prisma.users.findMany({
    where: { actif: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      site_id: true,
      direction_id: true,
      directions: { select: { site_id: true } },
    },
  })

  if (comptes.length === 0) return []

  const ids = comptes.map((c) => c.id)

  /*
    Rôles, permissions ET types de déclaration, en une requête.

    Les trois viennent de la même table de liaison : les permissions par `role_has_permissions`,
    les types par `role_parcours`. Les lire ensemble évite une requête par compte sur l'écran le
    plus visité.
  */
  const liens = await prisma.model_has_roles.findMany({
    where: { model_type: MODEL_TYPE_USER, model_id: { in: ids } },
    select: {
      model_id: true,
      roles: {
        select: {
          name: true,
          actif: true,
          role_has_permissions: {
            select: { permissions: { select: { name: true } } },
          },
          traite_dossiers: true,
          // Borné à son site ou à sa direction ? Paramètre du rôle, comme la charge.
          cloisonne_par_rattachement: true,
          role_parcours: {
            where: { parcours: { actif: true } },
            select: { parcours: { select: { code: true } } },
          },
        },
      },
    },
  })

  const rolesParCompte = new Map<bigint, Role[]>()
  const permissionsParCompte = new Map<bigint, Set<Permission>>()
  const parcoursParCompte = new Map<bigint, Set<ParcoursCode>>()
  const traitants = new Set<bigint>()
  /*
    ⚠️ UN RÔLE À LA FOIS, puis la règle au bout. Le compte n'est borné que si TOUS ses rôles
    porteurs d'accès le prévoient — voir `cloisonnePourSesRoles()`. Un `Set` d'identifiants aurait
    dit « au moins un », et retiré à un compte cumulant deux rôles ce que le second lui donnait le
    droit de voir.
  */
  const cloisonnementParCompte = new Map<bigint, { cloisonne: boolean; donneAcces: boolean }[]>()

  for (const lien of liens) {
    // Un rôle désactivé ne confère rien, exactement comme dans `chargerUtilisateurAutorise()`.
    if (!lien.roles.actif) continue

    rolesParCompte.set(lien.model_id, [
      ...(rolesParCompte.get(lien.model_id) ?? []),
      lien.roles.name as Role,
    ])

    // Un seul rôle traitant suffit : porter en plus un rôle d'observation ne retire pas la charge.
    if (lien.roles.traite_dossiers) traitants.add(lien.model_id)

    // Même lecture que `chargerUtilisateurAutorise()`, règle du cumul comprise.
    cloisonnementParCompte.set(lien.model_id, [
      ...(cloisonnementParCompte.get(lien.model_id) ?? []),
      {
        cloisonne: lien.roles.cloisonne_par_rattachement,
        donneAcces: donneAccesAuxDossiers(
          lien.roles.role_has_permissions
            .map((rhp) => rhp.permissions.name)
        ),
      },
    ])

    const permissions = permissionsParCompte.get(lien.model_id) ?? new Set<Permission>()
    for (const rhp of lien.roles.role_has_permissions) {
      permissions.add(rhp.permissions.name as Permission)
    }
    permissionsParCompte.set(lien.model_id, permissions)

    const parcours = parcoursParCompte.get(lien.model_id) ?? new Set<ParcoursCode>()
    for (const rp of lien.roles.role_parcours) parcours.add(rp.parcours.code as ParcoursCode)
    parcoursParCompte.set(lien.model_id, parcours)
  }

  return comptes
    .map((c) => ({
      id: c.id,
      nom: c.name,
      pourCloisonnement: {
        siteId: c.site_id ?? c.directions?.site_id ?? null,
        directionId: c.direction_id,
        roles: rolesParCompte.get(c.id) ?? [],
        permissions: permissionsParCompte.get(c.id) ?? new Set<Permission>(),
        parcours: [...(parcoursParCompte.get(c.id) ?? [])],
        traiteLesDossiers: traitants.has(c.id),
        cloisonneParRattachement: cloisonnePourSesRoles(cloisonnementParCompte.get(c.id) ?? []),
      },
    }))
    .filter((c) => c.pourCloisonnement.traiteLesDossiers)
}


/** Ceux d'entre eux dont le rattachement couvre CE dossier. */
export async function personnesEnCharge(
  dossier: RattachementDossier
): Promise<{ id: bigint; nom: string }[]> {
  const candidats = await comptesQuiTraitent()

  return candidats
    .filter(
      (c) =>
        // Habilité sur CE type de déclaration, et rattaché à CE dossier. Les deux, toujours.
        c.pourCloisonnement.parcours.includes(dossier.parcoursCode) &&
        rattachementCouvre(c.pourCloisonnement, dossier) &&
        // DT-06 : jamais le déclarant identifié. Une déclaration anonyme n'est rattachée à aucun
        // compte (RG-06), et `declarantUserId` y est nul — personne n'est alors écarté.
        (dossier.declarantUserId == null || c.id !== dossier.declarantUserId)
    )
    .map((c) => ({ id: c.id, nom: c.nom }))
}

/**
 * Ce que les traitants couvrent, par TYPE de déclaration, en valeurs exploitables en SQL.
 *
 * Décider en mémoire convient à une fiche, pas à une liste paginée : ce résumé permet d'exprimer
 * « les dossiers dont personne ne répond » comme une clause, partagée par le tableau de bord et
 * la liste qu'il ouvre.
 */
export type CouvertureParcours = {
  /** Un traitant sans rattachement couvre TOUT ce type : aucun dossier n'est alors orphelin. */
  readonly toutCouvert: boolean
  readonly directions: readonly bigint[]
  readonly sites: readonly bigint[]
}

export async function couvertureParParcours(): Promise<Map<ParcoursCode, CouvertureParcours>> {
  const candidats = await comptesQuiTraitent()

  const par = new Map<ParcoursCode, { toutCouvert: boolean; directions: bigint[]; sites: bigint[] }>()

  for (const code of PARCOURS_CODES) {
    par.set(code, { toutCouvert: false, directions: [], sites: [] })
  }

  for (const candidat of candidats) {
    // Même ordre que `rattachementCouvre()` : la direction d'abord, le site ensuite.
    const direction = directionCloisonnante(candidat.pourCloisonnement)
    const site = siteCloisonnant(candidat.pourCloisonnement)

    for (const code of candidat.pourCloisonnement.parcours) {
      const couverture = par.get(code)
      if (!couverture) continue

      if (direction !== null) couverture.directions.push(direction)
      else if (site !== null) couverture.sites.push(site)
      else couverture.toutCouvert = true
    }
  }

  return par
}


export type SuiviEi = {
  /** Actions correctives ouvertes — le plan d'action, résumé. */
  readonly actionsOuvertes: number
  readonly actionsTotal: number
  /** Prochaine échéance d'action, `null` si aucune action ouverte n'en porte. */
  readonly prochaineEcheance: Date | null
  /** Actions ouvertes dont l'échéance est déjà passée. */
  readonly actionsEnRetard: number
}

/** Vrai pour le seul parcours qui reçoit ce bloc de suivi. */
export function estEvenementIndesirable(code: string): code is ParcoursCode {
  return (PARCOURS_CODES as readonly string[]).includes(code) && code === 'ei_employe'
}

/**
 * Le plan d'action et son responsable, pour l'encadré de suivi d'un évènement indésirable.
 *
 * Rassemble ce que le métier demande de voir pour chaque EI — délai, personne en charge, plan
 * d'action, gravité — qui vivaient dispersés sur la fiche.
 */
export async function suiviEi(dossierId: string): Promise<SuiviEi> {
  /*
    ⚠️ NE CHARGE PLUS « qui en répond ». La fiche le demande maintenant pour les QUATRE types —
    plus aucune déclaration n'étant affectée —, et le charge donc une fois pour toutes, en amont.
    Le refaire ici aurait doublé la requête sur les seules fiches d'évènement indésirable.
  */
  const actions = await prisma.actions_correctives.findMany({
    where: { dossier_id: dossierId },
    select: { statut: true, echeance: true },
  })

  /*
    « Ouverte » = tout sauf réalisée.

    Les quatre statuts viennent de `STATUTS_ACTION` : `non_demarree`, `en_cours`, `en_retard` et
    `realisee`. Seul le dernier est un aboutissement — `en_retard` est posé par le recalcul, pas
    choisi, et une action en retard attend plus que les autres, certainement pas moins.
  */
  const ouvertes = actions.filter((a) => (a.statut as StatutAction) !== 'realisee')

  const aujourdHui = new Date()
  const echeances = ouvertes
    .map((a) => a.echeance)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())

  return {
    actionsOuvertes: ouvertes.length,
    actionsTotal: actions.length,
    prochaineEcheance: echeances[0] ?? null,
    actionsEnRetard: echeances.filter((d) => d < aujourdHui).length,
  }
}
