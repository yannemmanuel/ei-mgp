import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'
import {
  anonymiser,
  appliquerPolitiqueConservation,
  archiver,
  basculerContentieux,
  compterExclusPourContentieux,
} from '../conservation'

/**
 * RG-11 — politique de conservation.
 *
 * Ces traitements EFFACENT des données personnelles : ce sont les seuls du projet à le faire.
 * Les cas ci-dessous vérifient qu'ils n'effacent que ce qu'ils doivent, quand ils le doivent, et
 * qu'ils ne suppriment jamais le dossier lui-même (RG-03, RG-12).
 */
const MODEL_TYPE_DOSSIER = String.raw`App\Models\Dossier`
const dossiersCrees: string[] = []

const ilYaAnnees = (n: number) => {
  const date = new Date()
  date.setFullYear(date.getFullYear() - n)
  return date
}

const ilYaMois = (n: number) => {
  const date = new Date()
  date.setMonth(date.getMonth() - n)
  return date
}

async function dossierClotureLe(
  dateCloture: Date | null,
  options: { avecIdentite?: boolean; contentieux?: boolean } = {}
): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)
  const avecIdentite = options.avecIdentite ?? true

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: !avecIdentite,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
    ...(avecIdentite
      ? {
          donneesIdentite: {
            nomPrenom: 'Personne à effacer',
            contactEmail: 'a.effacer@example.test',
          },
        }
      : {}),
  })

  dossiersCrees.push(dossierId)

  await prisma.dossiers.update({
    where: { id: dossierId },
    data: { date_cloture: dateCloture, contentieux: options.contentieux ?? false },
  })

  return dossierId
}

beforeEach(async () => {
  // Garde-fou : ces traitements balaient TOUTE la base. Si un dossier réel devenait éligible,
  // le test l'anonymiserait pour de bon — mieux vaut échouer bruyamment.
  const eligiblesReels = await prisma.dossiers.count({
    where: {
      date_cloture: { not: null, lte: ilYaMois(24) },
      id: { notIn: dossiersCrees.length > 0 ? dossiersCrees : ['aucun'] },
    },
  })

  expect(eligiblesReels).toBe(0)
})

afterEach(async () => {
  await nettoyerAudit(MODEL_TYPE_DOSSIER, dossiersCrees)
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Archivage à 24 mois', () => {
  it('marque un dossier clôturé depuis plus de 24 mois', async () => {
    const id = await dossierClotureLe(ilYaMois(25))

    expect(await archiver()).toBe(1)

    const apres = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(apres.archive_le).not.toBeNull()
  })

  it('épargne un dossier clôturé plus récemment', async () => {
    const id = await dossierClotureLe(ilYaMois(23))

    expect(await archiver()).toBe(0)

    const apres = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(apres.archive_le).toBeNull()
  })

  it('ignore un dossier jamais clôturé', async () => {
    // Un dossier rejeté n'a pas de date de clôture : il n'entre jamais dans ce cycle (DT-32).
    const id = await dossierClotureLe(null)

    expect(await archiver()).toBe(0)

    const apres = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(apres.archive_le).toBeNull()
  })

  it('ne marque pas deux fois le même dossier', async () => {
    await dossierClotureLe(ilYaMois(30))

    expect(await archiver()).toBe(1)
    expect(await archiver()).toBe(0)
  })
})

describe('Anonymisation à 10 ans', () => {
  it('supprime l’identité mais JAMAIS le dossier', async () => {
    const id = await dossierClotureLe(ilYaAnnees(11))

    const avant = await prisma.declaration_identites.count({ where: { dossier_id: id } })
    expect(avant).toBe(1)

    expect(await anonymiser()).toBe(1)

    // L'identité disparaît…
    expect(await prisma.declaration_identites.count({ where: { dossier_id: id } })).toBe(0)

    // …le dossier survit, marqué. RG-03 interdit sa suppression, RG-12 exige que les
    // statistiques agrégées restent calculables sans limite de durée.
    const apres = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(apres.anonymise_le).not.toBeNull()
    expect(apres.reference).toBeTruthy()
  })

  it('épargne un dossier clôturé depuis moins de 10 ans', async () => {
    const id = await dossierClotureLe(ilYaAnnees(9))

    expect(await anonymiser()).toBe(0)
    expect(await prisma.declaration_identites.count({ where: { dossier_id: id } })).toBe(1)
  })

  it('n’effacera JAMAIS un dossier sous contentieux', async () => {
    const id = await dossierClotureLe(ilYaAnnees(20), { contentieux: true })

    expect(await anonymiser()).toBe(0)
    expect(await compterExclusPourContentieux()).toBe(1)

    // Même après vingt ans : le blocage n'expire pas, seul le DPO peut le lever.
    const apres = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(apres.anonymise_le).toBeNull()
    expect(await prisma.declaration_identites.count({ where: { dossier_id: id } })).toBe(1)
  })

  it('traite sans erreur un dossier déjà anonyme', async () => {
    // Aucune ligne d'identité à supprimer : le traitement doit marquer le dossier sans échouer.
    const id = await dossierClotureLe(ilYaAnnees(11), { avecIdentite: false })

    expect(await anonymiser()).toBe(1)

    const apres = await prisma.dossiers.findUniqueOrThrow({ where: { id } })
    expect(apres.anonymise_le).not.toBeNull()
  })

  it('ne retraite pas un dossier déjà anonymisé', async () => {
    await dossierClotureLe(ilYaAnnees(12))

    expect(await anonymiser()).toBe(1)
    expect(await anonymiser()).toBe(0)
  })

  it('journalise l’effacement sans y recopier l’identité', async () => {
    const id = await dossierClotureLe(ilYaAnnees(11))

    await anonymiser()

    const [trace] = await prisma.audit_logs.findMany({
      where: { action: 'dossier.anonymise', auditable_type: MODEL_TYPE_DOSSIER, auditable_id: id },
      select: { new_values: true },
    })

    expect(trace).toBeDefined()

    // Consigner l'identité au moment de l'effacer la déplacerait dans le journal au lieu de la
    // supprimer : seul le NOMBRE de lignes retirées y figure.
    const serialise = JSON.stringify(trace.new_values)
    expect(serialise).not.toContain('Personne à effacer')
    expect(serialise).not.toContain('a.effacer@example.test')
    expect((trace.new_values as Record<string, unknown>).identites_supprimees).toBe(1)
  })
})

describe('Blocage contentieux', () => {
  it('se pose et se lève, et suspend l’anonymisation entre-temps', async () => {
    const id = await dossierClotureLe(ilYaAnnees(11))

    expect(await basculerContentieux(id)).toBe(true)
    expect(await anonymiser()).toBe(0)

    expect(await basculerContentieux(id)).toBe(false)
    expect(await anonymiser()).toBe(1)
  })
})

describe('Traitement complet', () => {
  it('rend compte des trois compteurs', async () => {
    await dossierClotureLe(ilYaMois(25))
    await dossierClotureLe(ilYaAnnees(11))
    await dossierClotureLe(ilYaAnnees(15), { contentieux: true })

    const resultat = await appliquerPolitiqueConservation()

    // Les trois dossiers dépassent 24 mois : tous archivés, y compris celui sous contentieux —
    // l'archivage n'efface rien, seule l'anonymisation est bloquée.
    expect(resultat.archives).toBe(3)
    expect(resultat.anonymises).toBe(1)
    expect(resultat.exclusPourContentieux).toBe(1)
  })
})
