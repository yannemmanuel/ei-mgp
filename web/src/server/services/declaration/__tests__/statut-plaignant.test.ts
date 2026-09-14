import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../creer-declaration'
import { categoriePour, nettoyerDossiers } from './aide-base'

/**
 * Ce que la base retient d'une plainte riveraine — anonyme comprise.
 *
 * ⚠️ Le cas qui compte est l'ANONYME. Le statut du plaignant y était demandé, obligatoire, puis
 * jeté : il vivait dans `declaration_identites`, table qui n'est pas créée quand l'anonymat est
 * coché. Cinq des six plaintes en base n'avaient aucun statut pour cette seule raison. Un test qui
 * ne poserait que le cas identifié serait passé au vert tout du long.
 */
const dossiers: string[] = []

afterEach(async () => {
  await nettoyerDossiers(dossiers)
  dossiers.length = 0
})

async function plainte(anonyme: boolean, statut: string, precision?: string) {
  const categorie = await categoriePour('grief_communaute')

  const cree = await creerDeclaration({
    parcours: 'grief_communaute',
    canalCaptageCode: 'qr_code',
    anonyme,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: null,
      description: 'Nuisance sonore persistante sur le quartier.',
      ville: 'Abidjan',
      statutPlaignant: statut,
      statutPlaignantPrecision: precision ?? null,
    },
    donneesIdentite: anonyme ? undefined : { nomPrenom: 'Awa Koffi' },
  })

  dossiers.push(cree.dossierId)

  return prisma.dossiers.findUniqueOrThrow({
    where: { id: cree.dossierId },
    select: {
      is_anonymous: true,
      statut_plaignant: true,
      statut_plaignant_precision: true,
      declaration_identites: { select: { id: true } },
    },
  })
}

describe('Le statut du plaignant est conservé', () => {
  it('⚠️ même pour une plainte ANONYME', async () => {
    const d = await plainte(true, 'chef_coutumier')

    expect(d.is_anonymous).toBe(true)
    // RG-06 : aucune ligne d'identité pour une déclaration anonyme. C'est précisément pour cela
    // que le statut ne pouvait pas y vivre.
    expect(d.declaration_identites, 'une ligne d’identité a été créée pour un anonyme').toBeNull()
    expect(d.statut_plaignant, 'le statut a de nouveau été jeté').toBe('chef_coutumier')
  })

  it('et pour une plainte identifiée', async () => {
    const d = await plainte(false, 'association')

    expect(d.statut_plaignant).toBe('association')
    expect(d.declaration_identites).not.toBeNull()
  })

  it('retient la saisie libre quand « autre » est choisi', async () => {
    const d = await plainte(true, 'autre', 'Pêcheur du village voisin')

    expect(d.statut_plaignant).toBe('autre')
    expect(d.statut_plaignant_precision, '« autre » sans précision ne dit rien').toBe(
      'Pêcheur du village voisin'
    )
  })
})
