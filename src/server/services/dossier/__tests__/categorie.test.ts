import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const doubles = vi.hoisted(() => ({ journaliser: vi.fn() }))

vi.mock('@/server/services/audit/journal', () => ({
  journaliser: doubles.journaliser,
}))

const { modifierCategorieDossier } = await import('../categorie')

describe('Modification de la catégorie pendant le traitement', () => {
  const trouverDossier = vi.spyOn(prisma.dossiers, 'findUnique')
  const trouverCategorie = vi.spyOn(prisma.categories, 'findUnique')
  const mettreAJour = vi.spyOn(prisma.dossiers, 'update')

  beforeEach(() => {
    vi.clearAllMocks()
    mettreAJour.mockResolvedValue({} as never)
    doubles.journaliser.mockResolvedValue(undefined)
  })

  it('change la catégorie du même parcours et journalise le geste', async () => {
    trouverDossier.mockResolvedValueOnce({
      categorie_id: 1n,
      categorie_autre_precision: null,
      parcours_id: 10n,
      categories: { libelle: 'Ancienne catégorie' },
    } as never)
    trouverCategorie.mockResolvedValueOnce({
      id: 2n,
      parcours_id: 10n,
      libelle: 'Nouvelle catégorie',
      is_autre: false,
      actif: true,
    } as never)

    await modifierCategorieDossier({
      dossierId: 'dossier-1',
      categorieId: 2n,
      acteurId: 7n,
    })

    expect(mettreAJour).toHaveBeenCalledWith({
      where: { id: 'dossier-1' },
      data: {
        categorie_id: 2n,
        categorie_autre_precision: null,
        updated_at: expect.any(Date),
      },
    })
    expect(doubles.journaliser).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dossier.categorie_modifiee',
        acteurId: 7n,
        auditableId: 'dossier-1',
      })
    )
  })

  it('refuse une catégorie appartenant à un autre type de déclaration', async () => {
    trouverDossier.mockResolvedValueOnce({
      categorie_id: 1n,
      categorie_autre_precision: null,
      parcours_id: 10n,
      categories: { libelle: 'Catégorie actuelle' },
    } as never)
    trouverCategorie.mockResolvedValueOnce({
      id: 2n,
      parcours_id: 11n,
      libelle: 'Catégorie étrangère',
      is_autre: false,
      actif: true,
    } as never)

    await expect(
      modifierCategorieDossier({ dossierId: 'dossier-1', categorieId: 2n, acteurId: 7n })
    ).rejects.toThrow('ne correspond pas au type')
    expect(mettreAJour).not.toHaveBeenCalled()
  })

  it('exige une précision pour la catégorie Autre', async () => {
    trouverDossier.mockResolvedValueOnce({
      categorie_id: 1n,
      categorie_autre_precision: null,
      parcours_id: 10n,
      categories: { libelle: 'Catégorie actuelle' },
    } as never)
    trouverCategorie.mockResolvedValueOnce({
      id: 3n,
      parcours_id: 10n,
      libelle: 'Autre',
      is_autre: true,
      actif: true,
    } as never)

    await expect(
      modifierCategorieDossier({
        dossierId: 'dossier-1',
        categorieId: 3n,
        precisionAutre: '   ',
        acteurId: 7n,
      })
    ).rejects.toThrow('Précisez la catégorie')
    expect(mettreAJour).not.toHaveBeenCalled()
  })
})
