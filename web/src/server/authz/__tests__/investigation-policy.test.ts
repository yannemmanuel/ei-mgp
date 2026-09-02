import { describe, expect, it } from 'vitest'
import { peutValiderInvestigation, type InvestigationPourAutorisation } from '../policies/investigation'
import { utilisateurAvecRoles } from './aide'

/** Port de `tests/Feature/Policies/InvestigationPolicyTest.php` (Laravel). */
describe('InvestigationPolicy — validation hiérarchique (RGI-06, EX-INV-05)', () => {
  it("n'autorise JAMAIS l'enquêteur à valider sa propre investigation", () => {
    const enqueteur = utilisateurAvecRoles('responsable_grief_employe')
    const investigation: InvestigationPourAutorisation = {
      parcoursCode: 'grief_employe',
      enqueteurId: enqueteur.id,
    }

    expect(peutValiderInvestigation(enqueteur, investigation)).toBe(false)
  })

  it('autorise un autre responsable_grief_employe à valider', () => {
    const enqueteur = utilisateurAvecRoles('responsable_grief_employe')
    const autre = utilisateurAvecRoles('responsable_grief_employe')
    const investigation: InvestigationPourAutorisation = {
      parcoursCode: 'grief_employe',
      enqueteurId: enqueteur.id,
    }

    expect(peutValiderInvestigation(autre, investigation)).toBe(true)
  })

  it('refuse la validation hors du périmètre de parcours du rôle', () => {
    const rqse = utilisateurAvecRoles('rqse') // ne porte pas investigations.validate
    const mgp = utilisateurAvecRoles('service_mgp') // transversal, porte la permission

    const surGriefEmploye: InvestigationPourAutorisation = {
      parcoursCode: 'grief_employe',
      enqueteurId: 999n,
    }

    expect(peutValiderInvestigation(rqse, surGriefEmploye)).toBe(false)
    expect(peutValiderInvestigation(mgp, surGriefEmploye)).toBe(true)
  })
})
