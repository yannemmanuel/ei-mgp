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
 * ⚠️ LA TABLE « QUEL RÔLE OUVRE QUEL TYPE DE DÉCLARATION » A QUITTÉ CE FICHIER.
 *
 * Elle vit désormais en base, dans `role_parcours`, et se coche dans
 * `/administration/habilitations` (décision métier du 2026-09-20). Confier les griefs
 * sous-traitants à un rôle de plus ne demande plus de déploiement.
 *
 * Deux règles ont disparu avec elle, et c'est délibéré :
 *
 *   - **Les rôles transverses n'ont plus de traitement à part.** `service_mgp`, `dg`, `auditeur`
 *     et `dpo` portaient les 4 parcours par une constante séparée. Ils les portent maintenant
 *     comme tout le monde, par des lignes cochées. Une seule vérité, lisible au même endroit.
 *   - **L'attribution par PERSONNE n'entre plus dans la décision.** Le périmètre se lisait
 *     « rôle ∩ attribution » ; il se lit « rôle ». La table `utilisateur_parcours` subsiste et
 *     n'est plus lue — voir `chargerUtilisateurAutorise()`.
 *
 * Ce module ne garde donc que ce qui ne dépend d'aucune donnée : la liste close des parcours, et
 * les prédicats qui LISENT le périmètre déjà résolu. Résoudre le périmètre est le travail de
 * `chargerUtilisateurAutorise()`, qui interroge la base à chaque requête comme il le fait déjà
 * pour les rôles et les permissions.
 */

/**
 * Ce qu'il faut savoir d'une personne pour décider de son périmètre.
 *
 * Décrit par sa forme plutôt qu'importé de `./utilisateur` : `UtilisateurAutorise` le satisfait,
 * et les deux modules restent indépendants l'un de l'autre.
 */
export type PorteurDeParcours = {
  readonly roles: readonly Role[]
  /**
   * Types de déclaration ouverts par ses RÔLES — résolu depuis `role_parcours` au chargement.
   *
   * ⚠️ C'est le périmètre effectif, pas une liste de souhaits : `parcoursAutorises()` le rend tel
   * quel. Rien ne le recroise ensuite avec une autre table.
   */
  readonly parcours: readonly ParcoursCode[]
}

/**
 * Les parcours qu'une personne voit.
 *
 * ⚠️ Une liste VIDE signifie « aucun dossier », et c'est la règle retenue : l'habilitation est
 * explicite, jamais déduite. Tout appelant doit traiter la liste vide comme « rien à montrer » —
 * une liste vide passée à un `in:` SQL ne ramène aucune ligne, ce qui est le comportement voulu.
 *
 * ⚠️ IL N'Y A PLUS DE RÔLE QUI ÉCHAPPE À LA RÈGLE. Un rôle transverse voit les 4 parcours parce
 * qu'ils lui sont cochés, pas parce qu'il est nommé quelque part. Décocher les quatre le prive
 * de tout, et c'est ce qu'un administrateur doit pouvoir faire sans nous.
 */
export function parcoursAutorises(u: PorteurDeParcours): ParcoursCode[] {
  return [...u.parcours]
}

export function peutVoirParcours(u: PorteurDeParcours, parcours: ParcoursCode): boolean {
  return u.parcours.includes(parcours)
}
