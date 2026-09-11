import { describe, expect, it } from 'vitest'

/**
 * EX-DEC-07 : champs obligatoires validés et message d'erreur explicite pour chacun.
 */
import {
  DELAI_MINIMAL_REMPLISSAGE_SECONDES,
  identiteSousTraitant,
  precisionAutreManquante,
  socleDeclaration,
  soumissionTropRapide,
} from '../declaration'

const base = {
  anonymat: true,
  categorieId: '1',
  niveauGraviteId: '1',
  description: 'Extincteur vide, atelier 3.',
  dateSurvenance: new Date().toISOString(),
  horodatageAffichage: Math.floor(Date.now() / 1000) - 60,
}

describe('Socle de déclaration', () => {
  it('accepte une saisie valide', () => {
    expect(socleDeclaration.safeParse(base).success).toBe(true)
  })

  it('accepte une description COURTE — le plancher de RGI-02 reste levé', () => {
    // Les deux arbitrages du 08/09/2026 doivent tenir ensemble : le champ est redevenu
    // obligatoire, mais sans minimum de longueur. « Fuite gaz zone B » fait 16 caractères et
    // reste un signalement recevable — c'est précisément ce que le plancher écartait.
    expect(socleDeclaration.safeParse({ ...base, description: 'Fuite gaz zone B' }).success).toBe(
      true
    )
    expect(socleDeclaration.safeParse({ ...base, description: 'Fumée' }).success).toBe(true)
  })

  it('REFUSE une description absente ou vide', () => {
    // Un dossier sans aucun récit des faits n'est ni qualifiable ni affectable.
    expect(socleDeclaration.safeParse({ ...base, description: '' }).success).toBe(false)

    // Des espaces ne sont pas un récit : le schéma élague avant de mesurer.
    expect(socleDeclaration.safeParse({ ...base, description: '   ' }).success).toBe(false)

    const sansChamp = { ...base }
    delete (sansChamp as { description?: string }).description
    const r = socleDeclaration.safeParse(sansChamp)

    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'description')).toBe(true)
  })

  it('refuse une description de plus de 200 caractères', () => {
    const r = socleDeclaration.safeParse({ ...base, description: 'a'.repeat(201) })

    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'description')).toBe(true)
  })

  it('accepte exactement 200 caractères (borne incluse)', () => {
    expect(socleDeclaration.safeParse({ ...base, description: 'a'.repeat(200) }).success).toBe(true)
  })

  it('refuse une date des faits postérieure à aujourd’hui (RGI-01)', () => {
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)

    const r = socleDeclaration.safeParse({ ...base, dateSurvenance: demain.toISOString() })

    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'dateSurvenance')).toBe(true)
  })

  it('accepte une date des faits le jour même (RGI-01, cas limite)', () => {
    // Cas majoritaire en pratique : les faits sont déclarés le jour où ils surviennent.
    const r = socleDeclaration.safeParse({ ...base, dateSurvenance: new Date().toISOString() })

    expect(r.success).toBe(true)
  })

  it('exige catégorie et niveau de gravité', () => {
    const r = socleDeclaration.safeParse({ ...base, categorieId: '', niveauGraviteId: '' })

    expect(r.success).toBe(false)
    const champs = r.error?.issues.map((i) => i.path[0])
    expect(champs).toContain('categorieId')
    expect(champs).toContain('niveauGraviteId')
  })

  it('refuse une soumission dont le champ piège est rempli (DT-14)', () => {
    const r = socleDeclaration.safeParse({ ...base, piegeAraignee: 'rempli par un robot' })

    expect(r.success).toBe(false)
  })
})

describe('Anti-spam par délai de remplissage (DT-14)', () => {
  it('refuse une soumission plus rapide que le délai minimal', () => {
    const maintenant = Date.now()
    const affichage = Math.floor(maintenant / 1000)

    expect(soumissionTropRapide(affichage, maintenant)).toBe(true)
  })

  it('accepte une soumission au-delà du délai minimal', () => {
    const maintenant = Date.now()
    const affichage = Math.floor(maintenant / 1000) - DELAI_MINIMAL_REMPLISSAGE_SECONDES - 1

    expect(soumissionTropRapide(affichage, maintenant)).toBe(false)
  })
})

describe('Catégorie « Autre » (RG-09)', () => {
  it('exige une précision quand la catégorie est « Autre »', () => {
    expect(precisionAutreManquante(true, undefined)).toBe(true)
    expect(precisionAutreManquante(true, '   ')).toBe(true)
    expect(precisionAutreManquante(true, 'Détail fourni')).toBe(false)
  })

  it("n'exige rien pour une catégorie ordinaire", () => {
    expect(precisionAutreManquante(false, undefined)).toBe(false)
  })
})

describe('Consentement RGPD du parcours Sous-traitant (RG-15)', () => {
  const identite = {
    nomPrenom: 'Awa Koffi',
    entreprise: 'Entreprise X',
    consentementRgpd: true,
  }

  it('accepte une identité avec consentement explicite', () => {
    expect(identiteSousTraitant.safeParse(identite).success).toBe(true)
  })

  it('refuse une identité sans consentement — bloquant pour ce parcours uniquement', () => {
    const r = identiteSousTraitant.safeParse({ ...identite, consentementRgpd: false })

    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'consentementRgpd')).toBe(true)
  })
})
