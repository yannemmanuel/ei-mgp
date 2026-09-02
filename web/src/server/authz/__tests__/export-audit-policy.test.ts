import { describe, expect, it } from 'vitest'
import { peutExporter, peutExporterNominatif } from '../policies/export'
import { peutConsulterJournalAudit, peutVoirAdresseIpAudit } from '../policies/audit-log'
import { utilisateurAvecRoles } from './aide'

describe('ExportPolicy — restriction des données nominatives (EX-REP-06, RG-14)', () => {
  it('accorde l\'export à service_mgp, dg et auditeur', () => {
    for (const role of ['service_mgp', 'dg', 'auditeur'] as const) {
      expect(peutExporter(utilisateurAvecRoles(role)), role).toBe(true)
    }
  })

  it("réserve l'export NOMINATIF au seul service_mgp", () => {
    expect(peutExporterNominatif(utilisateurAvecRoles('service_mgp'))).toBe(true)
    expect(peutExporterNominatif(utilisateurAvecRoles('dg'))).toBe(false)
    expect(peutExporterNominatif(utilisateurAvecRoles('auditeur'))).toBe(false)
  })

  it("refuse tout export aux rôles de traitement", () => {
    for (const role of ['rqse', 'correspondant_mgp', 'secretaire_csst', 'employe_declarant'] as const) {
      expect(peutExporter(utilisateurAvecRoles(role)), role).toBe(false)
      expect(peutExporterNominatif(utilisateurAvecRoles(role)), role).toBe(false)
    }
  })
})

describe('AuditLogPolicy — lecture seule et non-réidentification', () => {
  it('accorde la consultation à auditeur, dpo et service_mgp', () => {
    for (const role of ['auditeur', 'dpo', 'service_mgp'] as const) {
      expect(peutConsulterJournalAudit(utilisateurAvecRoles(role)), role).toBe(true)
    }
  })

  it('refuse la consultation aux rôles de traitement', () => {
    for (const role of ['rqse', 'correspondant_mgp', 'dg'] as const) {
      expect(peutConsulterJournalAudit(utilisateurAvecRoles(role)), role).toBe(false)
    }
  })

  it("ne montre l'IP qu'au dpo et à l'auditeur, jamais à service_mgp (exigences-audit.md §5)", () => {
    expect(peutVoirAdresseIpAudit(utilisateurAvecRoles('dpo'))).toBe(true)
    expect(peutVoirAdresseIpAudit(utilisateurAvecRoles('auditeur'))).toBe(true)
    expect(peutVoirAdresseIpAudit(utilisateurAvecRoles('service_mgp'))).toBe(false)
  })
})
