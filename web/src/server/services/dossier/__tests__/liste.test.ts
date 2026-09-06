import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PARCOURS_CODES, peutVoirDossier, type ParcoursCode } from '@/server/authz'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { listerDossiers } from '../liste'

/**
 * Le périmètre de la liste et la policy `peutVoirDossier()` sont deux implémentations de la
 * MÊME règle : l'une en clause SQL, l'autre en prédicat. Ce test les croise sur des dossiers
 * réels — c'est la seule façon de détecter qu'elles divergent, cas où une liste afficherait un
 * dossier que la fiche refuserait (ou l'inverse).
 */
const crees: string[] = []

async function creerPour(parcours: ParcoursCode): Promise<string> {
  const categorie = await categoriePour(parcours)
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours,
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })

  crees.push(dossierId)
  return dossierId
}

afterEach(async () => {
  await nettoyerDossiers(crees)
  crees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Périmètre de la liste et policy : cohérence', () => {
  it('ne renvoie jamais un dossier que la policy refuserait à l’unité', async () => {
    for (const parcours of PARCOURS_CODES) {
      await creerPour(parcours)
    }

    const roles = [
      'rqse',
      'correspondant_mgp',
      'service_mgp',
      'auditeur',
      'comite_ethique',
      'administrateur_digital',
    ] as const

    for (const role of roles) {
      const u = utilisateurAvecRoles(role)
      const { dossiers } = await listerDossiers(u, {}, 1)

      for (const d of dossiers) {
        const autorise = peutVoirDossier(u, {
          parcoursCode: d.parcours.code as ParcoursCode,
          isAnonymous: d.is_anonymous,
          declarantUserId: null,
        })

        expect(autorise, `${role} voit ${d.reference} (${d.parcours.code}) hors de son périmètre`).toBe(true)
      }
    }
  })

  it('ne renvoie AUCUN dossier à administrateur_digital (DT-02)', async () => {
    await creerPour('ei_employe')

    const { dossiers, total } = await listerDossiers(utilisateurAvecRoles('administrateur_digital'), {}, 1)

    expect(dossiers).toHaveLength(0)
    expect(total).toBe(0)
  })

  it('cloisonne rqse sur le seul parcours EI', async () => {
    await creerPour('ei_employe')
    await creerPour('grief_communaute')

    const { dossiers } = await listerDossiers(utilisateurAvecRoles('rqse'), {}, 1)

    expect(dossiers.length).toBeGreaterThan(0)
    expect(dossiers.every((d) => d.parcours.code === 'ei_employe')).toBe(true)
  })

  it('donne accès aux 4 parcours à un rôle transversal', async () => {
    for (const parcours of PARCOURS_CODES) await creerPour(parcours)

    const { dossiers } = await listerDossiers(utilisateurAvecRoles('service_mgp'), {}, 1)
    const vus = new Set(dossiers.map((d) => d.parcours.code))

    for (const parcours of PARCOURS_CODES) {
      expect(vus.has(parcours), parcours).toBe(true)
    }
  })

  it('ne montre à un employé déclarant que ses propres dossiers non anonymes (RG-06)', async () => {
    const declarant = await prisma.users.findFirstOrThrow({ select: { id: true } })
    const categorie = await categoriePour('ei_employe')
    const gravite = await graviteParNiveau(1)

    // Un dossier anonyme déposé alors que le déclarant était connecté : il ne doit JAMAIS lui
    // être rattaché, donc jamais lui être listé.
    const anonyme = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: gravite.id,
        description: 'Description factuelle de test suffisamment longue.',
        declarantUserId: declarant.id,
      },
    })
    crees.push(anonyme.dossierId)

    const identifie = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: false,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: gravite.id,
        description: 'Description factuelle de test suffisamment longue.',
        declarantUserId: declarant.id,
      },
      donneesIdentite: { nomPrenom: 'Awa Koffi' },
    })
    crees.push(identifie.dossierId)

    const u = { ...utilisateurAvecRoles('employe_declarant'), id: declarant.id }
    const { dossiers } = await listerDossiers(u, {}, 1)
    const references = dossiers.map((d) => d.reference)

    expect(references).toContain(identifie.reference)
    expect(references).not.toContain(anonyme.reference)
  })
})

describe('Filtres (EX-GES-01)', () => {
  it('filtre par parcours', async () => {
    await creerPour('ei_employe')
    await creerPour('grief_communaute')

    const parcoursEi = await prisma.parcours.findFirstOrThrow({ where: { code: 'ei_employe' } })
    const { dossiers } = await listerDossiers(
      utilisateurAvecRoles('service_mgp'),
      { parcoursId: String(parcoursEi.id) },
      1
    )

    expect(dossiers.every((d) => d.parcours.code === 'ei_employe')).toBe(true)
  })

  it('filtre sur les dossiers dont l’utilisateur est titulaire actif', async () => {
    const u = utilisateurAvecRoles('service_mgp')
    const { dossiers } = await listerDossiers(u, { assigneAMoi: true }, 1)

    // L'utilisateur fabriqué n'existe pas en base : aucune affectation ne peut le désigner.
    expect(dossiers).toHaveLength(0)
  })
})
