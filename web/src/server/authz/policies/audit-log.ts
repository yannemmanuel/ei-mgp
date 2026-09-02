import { aPermission, type UtilisateurAutorise } from '../utilisateur'

/**
 * Port de `App\Policies\AuditLogPolicy` — lecture seule, sans exception
 * (docs/exigences-audit.md §4).
 *
 * Il n'existe volontairement AUCUNE fonction de modification ou de suppression ici, et il ne
 * doit jamais en être ajouté : le journal d'audit est append-only, y compris pour un profil
 * administrateur (docs/exigences-audit.md §3).
 */
export function peutConsulterJournalAudit(u: UtilisateurAutorise): boolean {
  return aPermission(u, 'audit.view')
}

/**
 * exigences-audit.md §5 : l'IP et le user-agent ne sont consultables que par le DPO et
 * l'auditeur — jamais par les autres porteurs de `audit.view` (dont `service_mgp`). Un
 * déclarant anonyme ne doit pas pouvoir être réidentifié via le journal.
 */
export function peutVoirAdresseIpAudit(u: UtilisateurAutorise): boolean {
  return u.roles.includes('dpo') || u.roles.includes('auditeur')
}
