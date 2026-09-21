import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  famillesRisqueActives,
  famillesRisqueProposees,
  qualifierFamilleRisque,
  typeQualifieLaFamille,
} from '../famille-risque'
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
 *
 * ⚠️ ELLE NE S'APPLIQUE PLUS À TOUS LES TYPES depuis le 2026-09-21 : l'évènement indésirable n'en
 * relève pas. Ce n'est pas écrit dans le code — `parcours.familles_risque_actives` se coche dans
 * `/administration/familles-risque` —, et les cas ci-dessous exercent donc les deux côtés : un
 * type qui qualifie, et un type qui ne qualifie pas.
 */
const dossiers: string[] = []

afterAll(async () => {
  await nettoyerDossiers(dossiers)
})

/** Le type sur lequel se jouent les cas de qualification : il doit en relever. */
const TYPE_QUALIFIANT = 'grief_employe'

/** Et celui qui n'en relève pas, pour exercer le refus. */
const TYPE_SANS_FAMILLE = 'ei_employe'

async function dossierDeType(parcours: 'grief_employe' | 'ei_employe'): Promise<string> {
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

  dossiers.push(dossierId)
  return dossierId
}

/**
 * Un dossier d'un type QUI QUALIFIE une famille.
 *
 * ⚠️ C'ÉTAIT UN ÉVÈNEMENT INDÉSIRABLE jusqu'au 2026-09-21. Le laisser aurait fait échouer chaque
 * cas de qualification — le service refuse désormais d'en poser une sur ce type — et donné à
 * croire à une régression là où il n'y a qu'un changement de fabrique.
 */
const nouveauDossier = () => dossierDeType(TYPE_QUALIFIANT)

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

describe('⚠️ La famille ne se demande que sur les types qui en relèvent', () => {
  it('ne propose RIEN sur un évènement indésirable', async () => {
    /*
      ⚠️ UNE LISTE VIDE FAIT DISPARAÎTRE LA CARTE de la fiche, et c'est l'effet voulu : la question
      ne se pose plus, plutôt que de se poser sans réponse possible.
    */
    expect(await typeQualifieLaFamille(TYPE_SANS_FAMILLE)).toBe(false)
    expect(await famillesRisqueProposees(TYPE_SANS_FAMILLE)).toEqual([])
  })

  it('les propose sur un type qui en relève', async () => {
    expect(await typeQualifieLaFamille(TYPE_QUALIFIANT)).toBe(true)

    const proposees = await famillesRisqueProposees(TYPE_QUALIFIANT)

    expect(proposees.length, 'aucune famille proposée : le cas ne prouverait rien').toBeGreaterThan(
      0
    )
    expect(proposees.map((f) => f.id)).toEqual((await famillesRisqueActives()).map((f) => f.id))
  })

  it('⚠️ REFUSE de poser une famille sur un type qui n’en relève pas', async () => {
    /*
      ⚠️ LE CONTRÔLE EST DANS LE SERVICE, PAS DANS L'ÉCRAN, et c'est tout l'objet de ce cas.

      La carte disparaît de la fiche — mais masquer un formulaire n'est pas une restriction. Une
      requête forgée poserait sinon une famille sur un évènement indésirable : une donnée que rien
      n'afficherait plus et que l'écran ne permettrait plus de défaire.
    */
    const familles = await famillesRisqueActives()
    const dossierId = await dossierDeType(TYPE_SANS_FAMILLE)

    await expect(
      qualifierFamilleRisque({ dossierId, familleId: familles[0].id })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    expect(
      (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id,
      'la famille a été posée malgré le refus'
    ).toBeNull()
  })

  it('⚠️ laisse RETIRER une famille sur un type qui n’en relève plus', async () => {
    /*
      La contrepartie indispensable du refus ci-dessus. Un dossier qualifié AVANT que son type ne
      soit décoché doit pouvoir être défait : interdire aussi le retrait l'enfermerait avec une
      donnée que plus rien n'affiche et que personne ne peut corriger.

      On pose la famille pendant que le type qualifie encore, puis on le décoche — exactement la
      situation qu'un administrateur crée en décochant une case.
    */
    const familles = await famillesRisqueActives()
    const dossierId = await dossierDeType(TYPE_QUALIFIANT)

    await qualifierFamilleRisque({ dossierId, familleId: familles[0].id })

    const type = await prisma.parcours.findFirstOrThrow({
      where: { code: TYPE_QUALIFIANT },
      select: { id: true },
    })

    try {
      await prisma.parcours.update({
        where: { id: type.id },
        data: { familles_risque_actives: false },
      })

      // La pose est refusée…
      await expect(
        qualifierFamilleRisque({ dossierId, familleId: familles[1].id })
      ).rejects.toBeInstanceOf(ErreurWorkflow)

      // …mais le retrait passe.
      await qualifierFamilleRisque({ dossierId, familleId: null })

      expect(
        (await prisma.dossiers.findUniqueOrThrow({ where: { id: dossierId } })).famille_risque_id
      ).toBeNull()
    } finally {
      await prisma.parcours.update({
        where: { id: type.id },
        data: { familles_risque_actives: true },
      })
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
    // ⚠️ D'un type QUI qualifie : un évènement indésirable n'apparaît plus du tout dans ce bloc,
    // et le cas se serait mis à ne rien prouver.
    await dossierDeType(TYPE_QUALIFIANT)

    const lignes = await repartitionParFamilleRisque(FILTRE_VIDE)
    const nonQualifiee = lignes.find((l) => l.libelle === 'Non qualifiée')

    expect(nonQualifiee, 'les dossiers sans famille ne sont pas comptés').toBeDefined()
    expect(nonQualifiee?.total ?? 0).toBeGreaterThan(0)
  })

  it('⚠️ ne somme que les dossiers des types QUI QUALIFIENT une famille', async () => {
    /*
      Une répartition dont les parts ne font pas le total se lit comme une erreur de calcul — et
      c'est ce qui arriverait si la ligne « Non qualifiée » manquait.

      ⚠️ LE TOTAL A CHANGÉ DE SENS le 2026-09-21. Les évènements indésirables ne qualifient plus de
      famille : les compter aurait gonflé « Non qualifiée » pour toujours, alors que c'est
      précisément la ligne qu'on lit comme « ce qu'il reste à faire ». Elle aurait annoncé un
      arriéré que personne ne pouvait résorber.
    */
    const lignes = await repartitionParFamilleRisque(FILTRE_VIDE)
    const somme = lignes.reduce((acc, l) => acc + l.total, 0)

    const attendu = await prisma.dossiers.count({
      where: { parcours: { familles_risque_actives: true } },
    })

    expect(somme).toBe(attendu)

    // Et le cas ne prouverait rien si tous les types qualifiaient : il faut au moins un exclu.
    expect(
      await prisma.dossiers.count({ where: { parcours: { familles_risque_actives: false } } }),
      'aucun dossier d’un type non qualifiant : le cas ne prouverait rien'
    ).toBeGreaterThan(0)
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
