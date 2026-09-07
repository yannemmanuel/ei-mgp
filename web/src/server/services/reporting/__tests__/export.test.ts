import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { classeurDossiers } from '../classeur'
import { rapportPdf } from '../document-pdf'
import { COLONNES_NOMINATIVES, cellules, colonnes, lignesExport } from '../export'
import { FILTRE_VIDE } from '../filtre'

/**
 * EX-REP-04/06 et RG-14 : le contenu d'un export est la seule voie par laquelle des données
 * nominatives quittent l'application. Ces cas vérifient qu'elles n'en sortent jamais par défaut.
 */
const dossiersCrees: string[] = []

async function nouveauDossier(anonyme: boolean, identite?: { nomPrenom: string; email: string }) {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
    ...(anonyme
      ? {}
      : {
          donneesIdentite: {
            nomPrenom: identite?.nomPrenom ?? 'Ama Kouassi',
            contactEmail: identite?.email ?? 'ama.kouassi@example.test',
          },
        }),
  })

  dossiersCrees.push(dossierId)
  return dossierId
}

/** Restreint l'export au seul dossier du test : la base contient d'autres dossiers réels. */
async function lignesDuDossier(dossierId: string, inclureNominatif: boolean) {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { reference: true },
  })

  const toutes = await lignesExport(FILTRE_VIDE, inclureNominatif)
  return toutes.filter((l) => l.reference === dossier.reference)
}

afterEach(async () => {
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Colonnes d’export (RG-14 / EX-REP-06)', () => {
  it('n’expose aucune colonne nominative par défaut', () => {
    const entetes = colonnes(false)

    for (const nominative of COLONNES_NOMINATIVES) {
      expect(entetes).not.toContain(nominative)
    }
    expect(entetes).toHaveLength(8)
  })

  it('ajoute les colonnes nominatives seulement quand elles sont autorisées', () => {
    expect(colonnes(true)).toEqual([...colonnes(false), ...COLONNES_NOMINATIVES])
  })

  it('produit autant de cellules que d’en-têtes, dans les deux modes', async () => {
    const dossierId = await nouveauDossier(false)

    for (const nominatif of [false, true]) {
      const [ligne] = await lignesDuDossier(dossierId, nominatif)
      expect(cellules(ligne, nominatif)).toHaveLength(colonnes(nominatif).length)
    }
  })
})

describe('Contenu de l’export', () => {
  it('ne charge même pas l’identité quand le nominatif n’est pas demandé', async () => {
    const dossierId = await nouveauDossier(false, {
      nomPrenom: 'Ama Kouassi',
      email: 'ama.kouassi@example.test',
    })

    const [ligne] = await lignesDuDossier(dossierId, false)

    // Ni dans une colonne, ni ailleurs dans la ligne : la donnée n'est pas lue du tout.
    expect(JSON.stringify(ligne)).not.toContain('Ama Kouassi')
    expect(JSON.stringify(ligne)).not.toContain('ama.kouassi@example.test')
  })

  it('restitue l’identité lorsque l’export nominatif est autorisé', async () => {
    const dossierId = await nouveauDossier(false, {
      nomPrenom: 'Ama Kouassi',
      email: 'ama.kouassi@example.test',
    })

    const [ligne] = await lignesDuDossier(dossierId, true)

    expect(ligne.nomDeclarant).toBe('Ama Kouassi')
    expect(ligne.email).toBe('ama.kouassi@example.test')
    expect(ligne.anonyme).toBe('Non')
  })

  it('laisse les colonnes nominatives vides pour un dossier anonyme (RG-06)', async () => {
    const dossierId = await nouveauDossier(true)

    // Même avec l'autorisation la plus large : il n'existe aucune identité à divulguer.
    const [ligne] = await lignesDuDossier(dossierId, true)

    expect(ligne.anonyme).toBe('Oui')
    expect(ligne.nomDeclarant).toBe('')
    expect(ligne.email).toBe('')
    expect(ligne.telephone).toBe('')
  })
})

describe('Génération des fichiers (EX-REP-04)', () => {
  it('produit un classeur xlsx réel', async () => {
    const dossierId = await nouveauDossier(true)
    const lignes = await lignesDuDossier(dossierId, false)

    const classeur = await classeurDossiers(lignes, false)

    // Signature ZIP « PK\x03\x04 » : un .xlsx est une archive, pas un CSV renommé.
    expect(classeur.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(classeur.length).toBeGreaterThan(1000)
  })

  it('produit un PDF réel', async () => {
    const dossierId = await nouveauDossier(true)
    const lignes = await lignesDuDossier(dossierId, false)

    const pdf = await rapportPdf(lignes, false, new Date('2026-01-15T10:00:00Z'))

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it('génère un export vide sans échouer', async () => {
    // Un filtre peut ne rien retourner : le rapport doit rester un fichier valide.
    const lignes: Awaited<ReturnType<typeof lignesExport>> = []

    await expect(classeurDossiers(lignes, false)).resolves.toBeInstanceOf(Buffer)
    await expect(rapportPdf(lignes, false)).resolves.toBeInstanceOf(Buffer)
  })
})
