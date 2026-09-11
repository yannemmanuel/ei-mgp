import type { Role } from './roles'

/**
 * Les 4 parcours du CDC §2.1 — port de `App\Enums\ParcoursCode`. Nombre fixe : aucune création
 * libre par l'administration, seuls les libellés en base restent administrables.
 */
export const PARCOURS_CODES = [
  'ei_employe',
  'grief_employe',
  'grief_sous_traitant',
  'grief_communaute',
] as const

export type ParcoursCode = (typeof PARCOURS_CODES)[number]

/**
 * Ce qu'un RÔLE rend possible — port de `App\Support\RoleParcoursScope` (docs/acteurs.md §1, §2).
 *
 * ⚠️ Cette table ne dit plus à elle seule ce qu'une personne voit. Elle dit ce qu'on PEUT lui
 * confier : le périmètre réel se lit avec `parcoursAutorises()`, qui la croise avec ce qui a été
 * attribué au compte. Un rôle absent d'ici n'ouvre aucun dossier, quelle que soit l'attribution
 * (ex. `administrateur_digital`, `agent_relais` qui ne fait que saisir).
 */
const ROLES_PAR_PARCOURS: Partial<Record<Role, readonly ParcoursCode[]>> = {
  secretaire_csst: ['ei_employe'],
  rqse: ['ei_employe'],
  rgp: ['grief_employe'],
  responsable_grief_employe: ['grief_employe'],
  comite_ethique: ['grief_employe'],
  correspondant_mgp: ['grief_employe', 'grief_sous_traitant', 'grief_communaute'],
  captage_grief_soustraitant: ['grief_sous_traitant'],
  captage_grief_communaute: ['grief_communaute'],
}

/** Accès transverse aux 4 parcours (docs/acteurs.md §2). */
const ROLES_TRANSVERSAUX = ['service_mgp', 'dg', 'auditeur', 'dpo'] as const satisfies readonly Role[]

/**
 * Ce qu'il faut savoir d'une personne pour décider de son périmètre.
 *
 * Décrit par sa forme plutôt qu'importé de `./utilisateur` : `UtilisateurAutorise` le satisfait,
 * et les deux modules restent indépendants l'un de l'autre.
 */
export type PorteurDeParcours = {
  readonly roles: readonly Role[]
  /** Types de déclaration confiés à cette personne — table `utilisateur_parcours`. */
  readonly parcours: readonly ParcoursCode[]
}

export function estTransversal(roles: readonly Role[]): boolean {
  return roles.some((role) => (ROLES_TRANSVERSAUX as readonly string[]).includes(role))
}

/**
 * Les parcours qu'un rôle permet de confier.
 *
 * Sert à DÉCRIRE un rôle — l'écran des habilitations, la liste de qui peut valider une fiche — et
 * à borner ce qu'un administrateur peut attribuer. Jamais à décider ce qu'une personne voit :
 * pour cela, `parcoursAutorises()`, qui tient compte de l'attribution.
 */
export function parcoursDuRole(roles: readonly Role[]): ParcoursCode[] {
  if (estTransversal(roles)) {
    return [...PARCOURS_CODES]
  }

  const ouverts = new Set<ParcoursCode>()
  for (const role of roles) {
    for (const parcours of ROLES_PAR_PARCOURS[role] ?? []) {
      ouverts.add(parcours)
    }
  }

  return [...ouverts]
}

/**
 * Les parcours qu'une PERSONNE voit réellement.
 *
 * Deux conditions, et les deux sont nécessaires : son rôle doit ouvrir le parcours, et le parcours
 * doit lui avoir été attribué. Le rôle dit ce qu'elle sait faire, l'attribution sur quoi elle le
 * fait. C'est la demande métier : trois correspondants MGP portent le même rôle sans voir les
 * mêmes dossiers, chaque type de grief ayant son référent.
 *
 * ⚠️ Sans attribution, la liste est VIDE et la personne ne voit aucun dossier. Ce n'est pas un
 * effet de bord, c'est la règle retenue : l'habilitation est explicite, jamais déduite du rôle.
 * Tout appelant doit donc traiter la liste vide comme « rien à montrer » — une liste vide passée
 * à un `in:` SQL ne ramène aucune ligne, ce qui est le comportement voulu.
 *
 * Les rôles transverses (Service MGP, Direction générale, Auditeur, DPO) échappent à la règle et
 * gardent les 4 parcours : sans eux, un dossier dont le parcours n'est attribué à personne
 * deviendrait invisible de tous.
 */
export function parcoursAutorises(u: PorteurDeParcours): ParcoursCode[] {
  if (estTransversal(u.roles)) {
    return [...PARCOURS_CODES]
  }

  const ouvertsParLesRoles = new Set(parcoursDuRole(u.roles))

  return u.parcours.filter((parcours) => ouvertsParLesRoles.has(parcours))
}

export function peutVoirParcours(u: PorteurDeParcours, parcours: ParcoursCode): boolean {
  if (estTransversal(u.roles)) {
    return true
  }

  return u.parcours.includes(parcours) && parcoursDuRole(u.roles).includes(parcours)
}
