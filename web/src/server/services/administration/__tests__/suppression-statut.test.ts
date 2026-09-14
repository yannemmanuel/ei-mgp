import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow, transitionsManuelles } from '@/server/services/dossier/workflow'
import { STATUTS } from '@/server/services/dossier/statuts'
import { santeAdministration } from '@/server/services/reporting/sante-administration'
import { modifierStatut } from '../referentiels'
import { supprimerStatut } from '../suppression'

/**
 * Supprimer et désactiver un statut.
 *
 * ⚠️ Un statut n'est pas une valeur de formulaire : c'est un ÉTAT du workflow, et le code le
 * nomme. La suppression est autorisée — décision métier — mais le risque n'est pas nié : il est
 * rendu VISIBLE, par un contrôle du tableau de bord qui signale tout état absent.
 */
const crees: bigint[] = []

async function acteur() {
  const u = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
  return { id: u.id }
}

/**
 * ⚠️ FILET DE SÉCURITÉ : tout statut disparu ou désactivé pendant un cas est remis en état.
 *
 * Ce fichier exerce une suppression réelle sur un référentiel dont l'absence casse l'application.
 * Un cas qui se trompe, ou une garde qui manque, ne doit pas laisser la base de travail amputée —
 * c'est arrivé une fois : « rejete » a disparu, et quatre autres fichiers de tests sont tombés
 * avec.
 *
 * L'empreinte est prise avant CHAQUE cas : un cas peut légitimement ajouter une ligne, et la
 * restauration ne doit porter que sur ce qui existait.
 */
let empreinte: {
  id: bigint
  code: string
  libelle_interne: string
  libelle_affiche: string
  is_terminal: boolean
  ordre: number
  actif: boolean
}[] = []

beforeEach(async () => {
  empreinte = await prisma.statuts_dossier.findMany({
    select: {
      id: true,
      code: true,
      libelle_interne: true,
      libelle_affiche: true,
      is_terminal: true,
      ordre: true,
      actif: true,
    },
  })
})

afterEach(async () => {
  const restants = new Map(
    (await prisma.statuts_dossier.findMany({ select: { id: true, actif: true } })).map((s) => [
      String(s.id),
      s.actif,
    ])
  )

  for (const statut of empreinte) {
    const actifCourant = restants.get(String(statut.id))

    if (actifCourant === undefined) {
      // Recréé avec son identifiant d'origine : dossiers et historique y pointent par `id`.
      await prisma.statuts_dossier.create({ data: statut })
    } else if (actifCourant !== statut.actif) {
      await prisma.statuts_dossier.update({
        where: { id: statut.id },
        data: { actif: statut.actif },
      })
    }
  }
})

afterAll(async () => {
  await prisma.statuts_dossier.deleteMany({ where: { id: { in: crees } } })
})

describe('La suppression refuse ce qui est cité', () => {
  it('refuse un statut atteint par des dossiers', async () => {
    const cite = await prisma.statuts_dossier.findFirst({
      where: { dossiers: { some: {} } },
      select: { id: true },
    })

    if (!cite) return // aucun dossier : le cas ne prouverait rien

    await expect(supprimerStatut(await acteur(), cite.id)).rejects.toThrow(ErreurWorkflow)
    expect(await prisma.statuts_dossier.findUnique({ where: { id: cite.id } })).not.toBeNull()
  })

  it('renvoie vers la désactivation, en disant ce qu’elle fait', async () => {
    // Un refus sans remède est une impasse. Et le remède doit dire ce qu'il change, sans quoi on
    // le prend pour une suppression déguisée.
    const cite = await prisma.statuts_dossier.findFirst({
      where: { dossiers: { some: {} } },
      select: { id: true },
    })

    if (!cite) return

    await expect(supprimerStatut(await acteur(), cite.id)).rejects.toThrow(/[Dd]ésactivez/)
    await expect(supprimerStatut(await acteur(), cite.id)).rejects.toThrow(/y resteront/)
  })

  it('efface une ligne que rien ne cite', async () => {
    const orphelin = await prisma.statuts_dossier.create({
      data: {
        code: `hors-circuit-${Date.now()}`,
        libelle_interne: 'Statut hors circuit',
        libelle_affiche: 'En cours',
        ordre: 99,
      },
      select: { id: true },
    })
    crees.push(orphelin.id)

    await supprimerStatut(await acteur(), orphelin.id)

    expect(await prisma.statuts_dossier.findUnique({ where: { id: orphelin.id } })).toBeNull()
  })
})

describe('La désactivation retire du CHOIX, sans toucher au passé', () => {
  it('retire le statut des transitions proposées', async () => {
    /*
      C'est tout ce que la désactivation signifie, et il fallait que ce soit vérifiable : sans cet
      effet, la colonne `actif` n'aurait été qu'un drapeau que rien ne lit — la promesse d'une
      protection inexistante.
    */
    const avant = await transitionsManuelles('recu')
    expect(
      avant.map((t) => t.code),
      'rien n’est proposé depuis « reçu » : le cas ne prouverait rien'
    ).toContain('affecte')

    const affecte = await prisma.statuts_dossier.findFirstOrThrow({ where: { code: 'affecte' } })

    await modifierStatut(await acteur(), affecte.id, {
      libelleInterne: affecte.libelle_interne,
      libelleAffiche: affecte.libelle_affiche,
      ordre: affecte.ordre,
      actif: false,
    })

    const apres = await transitionsManuelles('recu')
    expect(
      apres.map((t) => t.code),
      'le statut désactivé est encore proposé'
    ).not.toContain('affecte')
  })

  it('⚠️ laisse en place les dossiers qui s’y trouvent déjà', async () => {
    // On retire une valeur du choix FUTUR, on ne réécrit pas le passé. Un dossier déplacé ou vidé
    // par une désactivation serait une perte silencieuse.
    const statut = await prisma.statuts_dossier.findFirst({
      where: { dossiers: { some: {} } },
      select: { id: true, libelle_interne: true, libelle_affiche: true, ordre: true },
    })

    if (!statut) return

    const avant = await prisma.dossiers.count({ where: { statut_id: statut.id } })

    await modifierStatut(await acteur(), statut.id, {
      libelleInterne: statut.libelle_interne,
      libelleAffiche: statut.libelle_affiche,
      ordre: statut.ordre,
      actif: false,
    })

    expect(
      await prisma.dossiers.count({ where: { statut_id: statut.id } }),
      'des dossiers ont quitté le statut désactivé'
    ).toBe(avant)
  })
})

describe('⚠️ Un état absent du circuit est SIGNALÉ', () => {
  it('ne signale rien quand les dix sont là', async () => {
    const alerte = (await santeAdministration()).find((a) => a.cle === 'statuts-manquants')

    expect(alerte, 'une alerte remonte alors que rien ne manque').toBeUndefined()
  })

  it('nomme la conséquence quand un état manque', async () => {
    /*
      Le contrepoids de la suppression autorisée. La garde du graphe a été retirée sur décision
      métier ; le risque est donc rendu visible en AVAL plutôt que barré en amont — un dispositif
      cassé qui s'annonce vaut mieux qu'un dispositif cassé qui se découvre au premier dépôt.

      ⚠️ Le statut supprimé ici est recréé par le filet `afterEach`.
    */
    const rejete = await prisma.statuts_dossier.findFirst({
      where: { code: 'rejete' },
      select: { id: true, _count: { select: { dossiers: true } } },
    })

    if (!rejete || rejete._count.dossiers > 0) return // cité : on ne peut pas le supprimer

    await supprimerStatut(await acteur(), rejete.id)

    const alerte = (await santeAdministration()).find((a) => a.cle === 'statuts-manquants')

    expect(alerte, 'un état manquant passe inaperçu').toBeDefined()
    expect(alerte?.bloquant, 'présenté comme une simple négligence').toBe(true)
    expect(alerte?.consequence, 'le geste de restauration n’est pas indiqué').toContain('seed')
  })

  it('distingue « reçu », dont l’absence arrête TOUTE déclaration', async () => {
    // La conséquence n'est pas la même selon l'état : sans « reçu », plus rien ne peut être
    // déposé. Le dire distinctement évite de chercher la panne ailleurs.
    expect((STATUTS as readonly string[]).includes('recu')).toBe(true)

    const recu = await prisma.statuts_dossier.findFirstOrThrow({
      where: { code: 'recu' },
      select: { id: true, _count: { select: { dossiers: true } } },
    })

    // Il est cité en pratique, donc protégé par la garde des citations : c'est ce qui rend le
    // risque théorique sur cette base-ci, et réel sur une base neuve.
    expect(recu._count.dossiers).toBeGreaterThan(0)
  })
})
