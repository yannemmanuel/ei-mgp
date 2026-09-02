import { aPermission, type UtilisateurAutorise } from '../utilisateur'

/**
 * Port de `App\Policies\ExportPolicy` (EX-REP-06, RG-14).
 *
 * Pas de cloisonnement par parcours ici, contrairement aux dossiers : les 3 rôles porteurs de
 * `reporting.export` (`service_mgp`, `dg`, `auditeur`) sont tous transversaux.
 */
export function peutExporter(u: UtilisateurAutorise): boolean {
  return aPermission(u, 'reporting.export')
}

/** Seul `service_mgp` porte `reporting.export.nominatif` — ni `dg`, ni `auditeur`. */
export function peutExporterNominatif(u: UtilisateurAutorise): boolean {
  return aPermission(u, 'reporting.export.nominatif')
}
