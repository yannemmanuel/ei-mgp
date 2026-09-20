import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { famillesRisqueActives, qualifierFamilleRisque } from '../famille-risque'
import { ErreurWorkflow } from '../workflow'
import { repartitionParFamilleRisque } from '../../reporting/indicateurs'
import { FILTRE_VIDE } from '../../reporting/filtre'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'

/**
 * La famille de risque, posée PENDANT le traitement.
 *
 * ⚠️ À ne pas confondre avec la catégorie : celle-ci vient du déclarant au moment du dépôt, dans
 * ses mots ; la famille est une lecture de traitant, après analyse. Les deux coexistent sur la
 * fiche, et rien ne doit les faire fusionner.
 */
const dossiers: string[] = []

afterAll(async () => {
  await nettoyerDossiers(dossiers)
})

async function nouveauDossier(): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })

  dossiers.push(dossierId)
  return dossierId
}

describe('Qualification d’un dossier', () => {
  it('pose une famille, puis la remplace', async () => {
    const familles = await famillesRisqueActives()

    expect(familles.length, 'aucune famille active : le cas ne prouverait rien').toBeGreaterThan(1)

    const dossierId = await nouveauDossier()

    await qualifierFamilleRisque({ dossierId, familleId: familles[0].id })
    expect(
      (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id
    ).toBe(familles[0].id)

    await qualifierFamilleRisque({ dossierId, familleId: familles[1].id })
    expect(
      (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id
    ).toBe(familles[1].id)
  })

  it('⚠️ permet de RETIRER une famille posée par erreur', async () => {
    // Sans cela, la seule issue serait d'en choisir une autre, également fausse — et la
    // répartition du tableau de bord compterait une qualification qui n'en est pas une.
    const familles = await famillesRisqueActives()
    const dossierId = await nouveauDossier()

    await qualifierFamilleRisque({ dossierId, familleId: familles[0].id })
    await qualifierFamilleRisque({ dossierId, familleId: null })

    expect(
      (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id
    ).toBeNull()
  })

  it('refuse une famille inconnue', async () => {
    const dossierId = await nouveauDossier()

    await expect(
      qualifierFamilleRisque({ dossierId, familleId: 999_999n })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('⚠️ refuse une famille DÉSACTIVÉE, sans toucher aux dossiers qui la portent', async () => {
    /*
      Règle commune à tous les référentiels ici : désactiver retire du CHOIX, jamais du passé.
      Le cas rétablit l'état d'origine quoi qu'il arrive — une famille laissée désactivée
      fausserait tous les cas suivants.
    */
    const familles = await famillesRisqueActives()
    const cible = familles[familles.length - 1]

    const dossierId = await nouveauDossier()
    await qualifierFamilleRisque({ dossierId, familleId: cible.id })

    try {
      await prisma.familles_risque.update({ where: { id: cible.id }, data: { actif: false } })

      const autre = await nouveauDossier()

      await expect(
        qualifierFamilleRisque({ dossierId: autre, familleId: cible.id })
      ).rejects.toBeInstanceOf(ErreurWorkflow)

      // Le dossier déjà qualifié la garde : le passé n'est pas réécrit.
      expect(
        (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id
      ).toBe(cible.id)

      expect((await famillesRisqueActives()).map((f) => f.id)).not.toContainEqual(cible.id)
    } finally {
      await prisma.familles_risque.update({ where: { id: cible.id }, data: { actif: true } })
    }
  })
})

describe('⚠️ Répartition par famille sur le tableau de bord', () => {
  it('compte les dossiers NON QUALIFIÉS sous leur propre ligne', async () => {
    /*
      ⚠️ LE CHIFFRE LE PLUS UTILE DU BLOC. La famille se pose pendant le traitement : un dossier
      qui n'en a pas est un dossier qu'on n'a pas encore lu. Taire ces lignes ferait croire à une
      répartition complète et masquerait exactement ce qu'il reste à faire.
    */
    await nouveauDossier()

    const lignes = await repartitionParFamilleRisque(FILTRE_VIDE)
    const nonQualifiee = lignes.find((l) => l.libelle === 'Non qualifiée')

    expect(nonQualifiee, 'les dossiers sans famille ne sont pas comptés').toBeDefined()
    expect(nonQualifiee?.total ?? 0).toBeGreaterThan(0)
  })

  it('somme exactement le nombre de dossiers du périmètre', async () => {
    // Une répartition dont les parts ne font pas le total se lit comme une erreur de calcul —
    // et c'est ce qui arriverait si la ligne « Non qualifiée » manquait.
    const lignes = await repartitionParFamilleRisque(FILTRE_VIDE)
    const somme = lignes.reduce((acc, l) => acc + l.total, 0)

    expect(somme).toBe(await prisma.dossiers.count())
  })

  it('place « Non qualifiée » en dernier', async () => {
    // C'est un reste, pas une famille : la lire au milieu des autres la ferait prendre pour une
    // catégorie de risque.
    const lignes = await repartitionParFamilleRisque(FILTRE_VIDE)
    const index = lignes.findIndex((l) => l.libelle === 'Non qualifiée')

    if (index === -1) return // tout est qualifié : rien à ordonner

    expect(index).toBe(lignes.length - 1)
  })
})
