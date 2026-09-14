import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import { STATUTS } from '@/server/services/dossier/statuts'
import { supprimerStatut } from '../suppression'

/**
 * La suppression d'un statut, et pourquoi elle refuse presque toujours.
 *
 * ⚠️ Un statut n'est pas une valeur de formulaire : c'est un ÉTAT du workflow, et le code le
 * nomme. `creerDeclaration()` cherche « recu » par son code à chaque dépôt ; `TRANSITIONS_AUTORISEES`
 * décrit qui mène à quoi. Supprimer une ligne que le code attend n'appauvrit pas un affichage —
 * elle empêche toute déclaration d'être créée, ou immobilise pour toujours les dossiers qui l'ont
 * atteinte.
 *
 * D'où une garde qui n'existe pour aucun autre référentiel : le GRAPHE, vérifié avant même les
 * citations.
 */
const crees: bigint[] = []

async function acteur() {
  const u = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
  return { id: u.id }
}

/**
 * ⚠️ FILET DE SÉCURITÉ : tout statut disparu pendant un cas est recréé à l'identique.
 *
 * Ce fichier vérifie des REFUS. Or un cas qui vérifie un refus EXÉCUTE l'action le jour où le
 * refus manque — c'est précisément ce jour-là qu'il ne doit rien coûter. Sans ce filet, une garde
 * cassée faisait effacer pour de bon les statuts qu'aucun dossier ne cite : constaté, « rejete »
 * a disparu de la base de travail et quatre autres fichiers de tests sont tombés avec.
 *
 * L'empreinte est prise AVANT chaque cas plutôt qu'une fois pour toutes : un cas peut légitimement
 * ajouter une ligne, et la restauration ne doit porter que sur ce qui existait.
 */
let empreinte: {
  id: bigint
  code: string
  libelle_interne: string
  libelle_affiche: string
  is_terminal: boolean
  ordre: number
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
    },
  })
})

afterEach(async () => {
  const restants = new Set(
    (await prisma.statuts_dossier.findMany({ select: { id: true } })).map((s) => String(s.id))
  )

  for (const statut of empreinte) {
    if (restants.has(String(statut.id))) continue

    // Recréé avec son identifiant d'origine : les dossiers et l'historique y pointent par `id`.
    await prisma.statuts_dossier.create({ data: statut })
  }
})

afterAll(async () => {
  await prisma.statuts_dossier.deleteMany({ where: { id: { in: crees } } })
})

describe('⚠️ Un état nommé par le workflow est intouchable', () => {
  it('refuse CHACUN des dix statuts livrés', async () => {
    /*
      Tous, et pas seulement « recu ». Un seul manquant suffirait : le dossier qui l'aurait atteint
      n'en sortirait jamais, sans erreur ni message — il resterait simplement là.
    */
    const moi = await acteur()

    for (const code of STATUTS) {
      const statut = await prisma.statuts_dossier.findFirst({ where: { code }, select: { id: true } })

      expect(statut, `le statut « ${code} » est absent de la base`).not.toBeNull()

      await expect(
        supprimerStatut(moi, statut!.id),
        `« ${code} » a pu être supprimé`
      ).rejects.toThrow(ErreurWorkflow)
    }
  })

  it('refuse MÊME un statut qu’aucun dossier n’a atteint', async () => {
    /*
      Le cas que la garde des citations ne couvre pas : le code attend un état que la base ne cite
      pas encore. Compter les dossiers seul aurait laissé le supprimer, et la panne ne serait
      apparue qu'au premier dossier qui l'aurait atteint.

      ⚠️ CE CAS SE RÉPARE LUI-MÊME, et il le doit.

      Il vise une vraie ligne — le code est unique, on ne peut pas en fabriquer un doublon. Lors
      d'une injection de défaut, la garde désactivée, une première version a donc réellement
      effacé « rejete » de la base de travail, et quatre autres fichiers sont tombés avec.

      Un cas qui vérifie un REFUS exécute l'action le jour où le refus manque : c'est précisément
      ce jour-là qu'il ne doit rien coûter. Il restaure donc ce qu'il aurait pu détruire, même
      quand il échoue.
    */
    const avant = await prisma.statuts_dossier.findFirst({
      where: { code: 'rejete' },
      select: {
        id: true,
        code: true,
        libelle_interne: true,
        libelle_affiche: true,
        is_terminal: true,
        ordre: true,
        _count: { select: { dossiers: true } },
      },
    })

    if (!avant || avant._count.dossiers > 0) return // déjà cité : ce cas n'y ajouterait rien

    // La restauration est assurée par le filet `afterEach` ci-dessus, pour TOUS les cas.
    await expect(supprimerStatut(await acteur(), avant.id)).rejects.toThrow(/circuit de traitement/)
  })

  it('dit ce qui reste possible plutôt que de s’arrêter à un refus', async () => {
    // Renommer est ce que l'administrateur cherche neuf fois sur dix : les libellés interne et
    // affiché sont modifiables, seul le CODE est figé.
    const recu = await prisma.statuts_dossier.findFirstOrThrow({ where: { code: 'recu' } })

    await expect(supprimerStatut(await acteur(), recu.id)).rejects.toThrow(/libellé/)
  })
})

describe('Une ligne hors graphe s’efface, si rien ne la cite', () => {
  it('supprime un statut ajouté à la main', async () => {
    // Le seul cas où la suppression aboutit : une ligne que personne n'a prévue, et que rien
    // n'utilise.
    const orphelin = await prisma.statuts_dossier.create({
      data: {
        code: `hors-graphe-${Date.now()}`,
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

  it('⚠️ le refuse dès qu’un dossier l’a atteint', async () => {
    const orphelin = await prisma.statuts_dossier.create({
      data: {
        code: `hors-graphe-cite-${Date.now()}`,
        libelle_interne: 'Statut hors circuit cité',
        libelle_affiche: 'En cours',
        ordre: 98,
      },
      select: { id: true },
    })
    crees.push(orphelin.id)

    const dossier = await prisma.dossiers.findFirst({ select: { id: true, statut_id: true } })
    if (!dossier) return // base vide : le cas ne prouverait rien

    await prisma.dossiers.update({ where: { id: dossier.id }, data: { statut_id: orphelin.id } })

    try {
      await expect(supprimerStatut(await acteur(), orphelin.id)).rejects.toThrow(/dossier/)
    } finally {
      // ⚠️ Le dossier est remis dans son état d'origine quoi qu'il arrive : un test ne doit pas
      // laisser une déclaration réelle dans un statut inventé.
      await prisma.dossiers.update({
        where: { id: dossier.id },
        data: { statut_id: dossier.statut_id },
      })
    }
  })
})
