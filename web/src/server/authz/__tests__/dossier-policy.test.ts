import { describe, expect, it } from 'vitest'
import {
  peutVoirDossier,
  peutReouvrirDossier,
  peutVoirListeDossiers,
  type DossierPourAutorisation,
} from '../policies/dossier'
import { utilisateurAvecRoles } from './aide'

/**
 * Chaque cas reproduit une
 * assertion existante, afin que toute divergence de comportement soit détectée ici.
 */
const dossier = (
  parcoursCode: DossierPourAutorisation['parcoursCode'],
  extra: Partial<DossierPourAutorisation> = {}
): DossierPourAutorisation => ({
  parcoursCode,
  statutCode: 'en_analyse',
  isAnonymous: true,
  declarantUserId: null,
  siteId: null,
  directionId: null,
  // Défaut délibérément DÉFAVORABLE : un rôle en `dossiers.view.own` ne doit rien voir sans
  // affectation. Un défaut à `true` laisserait passer une régression sans que rien ne bouge.
  estAffecteAuLecteur: false,
  ...extra,
})

describe('DossierPolicy — cloisonnement par parcours', () => {
  it('laisse rqse voir un dossier EI mais pas un grief communauté', () => {
    const u = utilisateurAvecRoles('rqse')

    expect(peutVoirDossier(u, dossier('ei_employe'))).toBe(true)
    expect(peutVoirDossier(u, dossier('grief_communaute'))).toBe(false)
  })

  it('laisse correspondant_mgp voir les 3 parcours grief mais pas l\'EI', () => {
    const u = utilisateurAvecRoles('correspondant_mgp')

    expect(peutVoirDossier(u, dossier('grief_employe'))).toBe(true)
    expect(peutVoirDossier(u, dossier('grief_sous_traitant'))).toBe(true)
    expect(peutVoirDossier(u, dossier('grief_communaute'))).toBe(true)
    expect(peutVoirDossier(u, dossier('ei_employe'))).toBe(false)
  })

  it('laisse service_mgp, dg et auditeur voir les 4 parcours', () => {
    for (const role of ['service_mgp', 'dg', 'auditeur'] as const) {
      const u = utilisateurAvecRoles(role)
      for (const p of ['ei_employe', 'grief_employe', 'grief_sous_traitant', 'grief_communaute'] as const) {
        expect(peutVoirDossier(u, dossier(p)), `${role} / ${p}`).toBe(true)
      }
    }
  })

  it("n'accorde JAMAIS à administrateur_digital l'accès au moindre dossier (DT-02)", () => {
    const u = utilisateurAvecRoles('administrateur_digital')

    for (const p of ['ei_employe', 'grief_employe', 'grief_sous_traitant', 'grief_communaute'] as const) {
      expect(peutVoirDossier(u, dossier(p))).toBe(false)
    }
    expect(peutVoirListeDossiers(u)).toBe(false)
  })
})

describe('DossierPolicy — employé déclarant', () => {
  it('ne laisse voir que son propre dossier non anonyme', () => {
    const u = utilisateurAvecRoles('employe_declarant')

    // Le sien, non anonyme.
    expect(peutVoirDossier(u, dossier('ei_employe', { isAnonymous: false, declarantUserId: u.id }))).toBe(true)
    // Celui d'un autre.
    expect(peutVoirDossier(u, dossier('ei_employe', { isAnonymous: false, declarantUserId: 999n }))).toBe(false)
    // Anonyme : jamais rattaché à son auteur, même si l'id correspond (RG-06).
    expect(peutVoirDossier(u, dossier('ei_employe', { isAnonymous: true, declarantUserId: u.id }))).toBe(false)
  })
})

describe('DossierPolicy — réouverture (RG-07)', () => {
  it('réserve la réouverture à service_mgp et dg', () => {
    const d = dossier('ei_employe')

    expect(peutReouvrirDossier(utilisateurAvecRoles('service_mgp'), d)).toBe(true)
    expect(peutReouvrirDossier(utilisateurAvecRoles('dg'), d)).toBe(true)

    for (const role of ['rqse', 'secretaire_csst', 'correspondant_mgp', 'auditeur', 'dpo'] as const) {
      expect(peutReouvrirDossier(utilisateurAvecRoles(role), d), role).toBe(false)
    }
  })
})
