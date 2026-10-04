import { aPermission, type UtilisateurAutorise } from "../utilisateur";
import { peutVoirDossier, type DossierPourAutorisation } from "./dossier";

/** Port de `App\Policies\InvestigationPolicy`. */
export type InvestigationPourAutorisation = DossierPourAutorisation & {
  readonly enqueteurId: bigint;
};

export function peutVoirListeInvestigations(u: UtilisateurAutorise): boolean {
  return aPermission(u, "investigations.view");
}

export function peutVoirInvestigation(
  u: UtilisateurAutorise,
  i: InvestigationPourAutorisation,
): boolean {
  return aPermission(u, "investigations.view") && peutVoirDossier(u, i);
}

export function peutCreerInvestigation(
  u: UtilisateurAutorise,
  i: InvestigationPourAutorisation,
): boolean {
  return aPermission(u, "investigations.create") && peutVoirDossier(u, i);
}

export function peutModifierInvestigation(
  u: UtilisateurAutorise,
  i: InvestigationPourAutorisation,
): boolean {
  return aPermission(u, "investigations.update") && peutVoirDossier(u, i);
}

/*
  ⚠️ `peutValiderInvestigation` a été SUPPRIMÉE : une investigation n'est soumise à aucune
  validation (décision métier du 2026-09-18). RGI-06 et EX-INV-05, qui interdisaient à
  l'enquêteur de valider sa propre fiche, n'ont plus d'objet — il n'y a plus de geste à
  interdire.

  La permission `investigations.validate` EXISTE ENCORE en base et reste attribuable : elle ne
  commande simplement plus rien. Elle n'a pas été supprimée parce que cela signifierait effacer
  des lignes de `permissions` et `role_has_permissions` (5 rôles la portent), ce qui n'a pas été
  demandé.
*/
