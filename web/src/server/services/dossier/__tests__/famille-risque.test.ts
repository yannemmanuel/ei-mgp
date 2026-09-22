import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

/** Le type sur lequel se jouent les cas de qualification : il doit en relever. */
const TYPE_QUALIFIANT = 'grief_employe'

/** Et celui qui n'en relève PAS, pour exercer le refus. */
const TYPE_SANS_FAMILLE = 'ei_employe'

/*
  ⚠️ LA CONFIGURATION EST POSÉE, PAS PRÉSUMÉE — et c'est une correction, pas une précaution.

  Ces cas lisaient l'état du jour : « l'évènement indésirable ne qualifie pas », « le grief employé
  qualifie ». C'était vrai le jour où ils ont été écrits. Le paramétrage se coche depuis l'écran :
  un administrateur a recoché l'évènement indésirable et décoché les griefs pour y bâtir ses
  familles de risque — un usage parfaitement normal —, et onze cas sont passés au rouge sans
  qu'aucun défaut n'existe.

  Un cas qui dépend de l'ambiance ne prouve rien de stable. Chacun d'eux pose donc l'état dont il a
  besoin, et le fichier rend l'état d'origine à la fin. Ce que la base porte réellement appartient
  à l'administrateur, pas à la suite de tests.
*/
const ETAT_TYPES = new Map<string, boolean>()

/** Familles créées ici pour garantir qu'il y en ait à proposer — supprimées à la fin. */
const famillesJetables: bigint[] = []

beforeAll(async () => {
  for (const p of await prisma.parcours.findMany({
    select: { code: true, familles_risque_actives: true },
  })) {
    ETAT_TYPES.set(p.code, p.familles_risque_actives)
  }

  await prisma.parcours.updateMany({
    where: { code: TYPE_QUALIFIANT },
    data: { familles_risque_actives: true },
  })
  await prisma.parcours.updateMany({
    where: { code: TYPE_SANS_FAMILLE },
    data: { familles_risque_actives: false },
  })

  /*
    ⚠️ ET AU MOINS DEUX FAMILLES PROPOSABLES sur ce type. Les familles se créent, se renomment et
    se rattachent depuis l'écran : rien ne garantit qu'il en reste de communes. Plusieurs cas ont
    besoin d'en poser une puis de la remplacer — sans ces deux-là, ils ne prouveraient rien.
  */
  for (const suffixe of ['a', 'b']) {
    const libelle = `ZZ famille de reference ${suffixe} ${process.pid} ${Date.now()}`

    const creee = await prisma.familles_risque.create({
      data: {
        code: `zz_ref_${suffixe}_${process.pid}_${Date.now()}`.slice(0, 64),
        libelle,
        actif: true,
        parcours_id: null,
        ordre: 900,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })

    famillesJetables.push(creee.id)
  }
})

afterAll(async () => {
  await nettoyerDossiers(dossiers)

  // Les familles jetables d'abord — et seulement celles-ci, par identifiant.
  if (famillesJetables.length > 0) {
    await prisma.dossiers.updateMany({
      where: { famille_risque_id: { in: famillesJetables } },
      data: { famille_risque_id: null },
    })
    await prisma.familles_risque.deleteMany({ where: { id: { in: famillesJetables } } })
  }

  for (const [code, valeur] of ETAT_TYPES) {
    await prisma.parcours.updateMany({
      where: { code },
      data: { familles_risque_actives: valeur },
    })
  }
})

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
    // ⚠️ Les PROPOSÉES sur ce type, et non toutes les actives : depuis le rattachement, une
    // famille active peut être réservée à un autre type — le service la refuserait.
    const familles = await famillesRisqueProposees(TYPE_QUALIFIANT)

    expect(familles.length, 'moins de deux familles proposées : le cas ne prouverait rien').toBeGreaterThan(1)

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
    const familles = await famillesRisqueProposees(TYPE_QUALIFIANT)
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
    const familles = await famillesRisqueProposees(TYPE_QUALIFIANT)
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

    /*
      ⚠️ UN SOUS-ENSEMBLE DES ACTIVES, et plus leur égalité.

      Ce cas exigeait que le type propose TOUTES les familles actives. C'était vrai avant le
      rattachement (2026-09-22) : une famille réservée à un autre type est active et n'est pourtant
      pas proposée ici — c'est tout l'objet du rattachement. L'égalité rougissait donc dès qu'un
      administrateur rattachait sa première famille.
    */
    const actives = new Set((await famillesRisqueActives()).map((f) => String(f.id)))

    for (const famille of proposees) {
      expect(
        actives.has(String(famille.id)),
        `« ${famille.libelle} » est proposée alors qu’elle est désactivée`
      ).toBe(true)
    }
  })

  it('⚠️ REFUSE de poser une famille sur un type qui n’en relève pas', async () => {
    /*
      ⚠️ LE CONTRÔLE EST DANS LE SERVICE, PAS DANS L'ÉCRAN, et c'est tout l'objet de ce cas.

      La carte disparaît de la fiche — mais masquer un formulaire n'est pas une restriction. Une
      requête forgée poserait sinon une famille sur un évènement indésirable : une donnée que rien
      n'afficherait plus et que l'écran ne permettrait plus de défaire.
    */
    const familles = await famillesRisqueProposees(TYPE_QUALIFIANT)
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
    const familles = await famillesRisqueProposees(TYPE_QUALIFIANT)
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
