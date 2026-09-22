import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { nettoyerAudit } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  enregistrerCategorie,
  enregistrerDirection,
  enregistrerSite,
  deplacerCategorie,
  listerCategories,
  listerDirections,
  listerSites,
  modifierCanal,
  rattacherDirection,
  modifierStatut,
  supprimerCategorie,
} from '../referentiels'
import { MODELES } from '@/server/modeles'

/**
 * Référentiels d'administration
 *
 * Deux propriétés sont vérifiées à chaque fois : la mutation aboutit, ET elle laisse une trace
 * d'audit au format attendu. Une modification de référentiel non tracée est une modification
 * qu'aucun auditeur ne pourra expliquer (docs/exigences-audit.md §2).
 */
const categoriesCreees: bigint[] = []
const sitesCrees: bigint[] = []
const directionsCreees: bigint[] = []

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return { id: utilisateur.id }
}

async function lignesAudit(action: string, auditableId: string) {
  return prisma.audit_logs.findMany({
    where: { action, auditable_id: auditableId },
    orderBy: { id: 'asc' },
    select: { action: true, auditable_type: true, old_values: true, new_values: true, user_id: true },
  })
}

afterEach(async () => {
  // Le type est indispensable : « 34 » désigne aussi bien une catégorie qu'un autre modèle.
  await nettoyerAudit(MODELES.categorie, categoriesCreees)
  await nettoyerAudit(MODELES.site, sitesCrees)
  if (categoriesCreees.length > 0) {
    await prisma.categories.deleteMany({ where: { id: { in: categoriesCreees } } })
    categoriesCreees.length = 0
  }
  // Les directions partent AVANT les sites : la clé étrangère l'exige.
  await nettoyerAudit(MODELES.direction, directionsCreees)
  if (directionsCreees.length > 0) {
    await prisma.directions.deleteMany({ where: { id: { in: directionsCreees } } })
    directionsCreees.length = 0
  }
  if (sitesCrees.length > 0) {
    await prisma.sites.deleteMany({ where: { id: { in: sitesCrees } } })
    sitesCrees.length = 0
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Catégories', () => {
  it('les rend dans l’ordre ALPHABÉTIQUE, sans rang à régler', async () => {
    /*
     * Arbitrage du 11/09/2026 : le champ « Ordre d'affichage » a disparu des paramètres. Régler
     * à la main le rang de chaque ligne coûtait une renumérotation à chaque ajout, pour un
     * bénéfice que personne ne réclamait — on cherche une catégorie par son nom.
     *
     * Les deux libellés sont créés à CONTRE-SENS de l'alphabet : si le classement suivait encore
     * un rang ou l'identifiant, « Zzz » sortirait avant « Aaa ». Des initiales A et Z plutôt que
     * des accents, pour que l'assertion ne dépende pas de la collation de la base.
     */
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    for (const [code, libelle] of [
      ['test_tri_z', 'Zzz catégorie de tri'],
      ['test_tri_a', 'Aaa catégorie de tri'],
    ]) {
      categoriesCreees.push(
        await enregistrerCategorie(qui, {
          parcoursId: parcours.id,
          code,
          libelle,
          isAutre: false,
          actif: true,
        })
      )
    }

    const triees = (await listerCategories())
      .map((c) => c.libelle)
      .filter((libelle) => libelle.endsWith('catégorie de tri'))

    expect(triees).toEqual(['Aaa catégorie de tri', 'Zzz catégorie de tri'])
  })

  it('crée une catégorie et l’audite', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const id = await enregistrerCategorie(qui, {
      parcoursId: parcours.id,
      code: 'test_migration_categorie',
      libelle: 'Catégorie de test',
      isAutre: false,
      actif: true,
    })
    categoriesCreees.push(id)

    const [trace] = await lignesAudit('categorie.cree', String(id))

    expect(trace).toBeDefined()
    // Le type doit être exact : l'écran du journal filtre dessus, et `libelleObjet()` le traduit.
    expect(trace.auditable_type).toBe(MODELES.categorie)
    expect(trace.user_id).toBe(qui.id)
    expect((trace.new_values as Record<string, unknown>).code).toBe('test_migration_categorie')
  })

  it('refuse un code déjà utilisé sur le même parcours', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const id = await enregistrerCategorie(qui, {
      parcoursId: parcours.id,
      code: 'test_migration_doublon',
      libelle: 'Première',
      isAutre: false,
      actif: true,
    })
    categoriesCreees.push(id)

    await expect(
      enregistrerCategorie(qui, {
        parcoursId: parcours.id,
        code: 'test_migration_doublon',
        libelle: 'Seconde',
        isAutre: false,
        actif: true,
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('accepte le même code sur un AUTRE parcours', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findMany({ take: 2, select: { id: true } })

    for (const p of parcours) {
      const id = await enregistrerCategorie(qui, {
        parcoursId: p.id,
        code: 'test_migration_partage',
        libelle: 'Partagée',
        isAutre: false,
        actif: true,
      })
      categoriesCreees.push(id)
    }

    // L'unicité porte sur le couple : chaque parcours a sa propre nomenclature.
    const toutes = await listerCategories()
    expect(toutes.filter((c) => c.code === 'test_migration_partage')).toHaveLength(2)
  })

  it('n’écrit aucune trace quand rien n’a changé', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const donnees = {
      parcoursId: parcours.id,
      code: 'test_migration_inchange',
      libelle: 'Inchangée',
      isAutre: false,
      actif: true,
    }

    const id = await enregistrerCategorie(qui, donnees)
    categoriesCreees.push(id)

    // Réenregistrement à l'identique : un journal qui consigne les non-changements devient
    // illisible, et le vrai changement s'y perd.
    await enregistrerCategorie(qui, donnees, id)

    expect(await lignesAudit('categorie.modifie', String(id))).toHaveLength(0)
  })

  it('n’audite que les champs réellement modifiés', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const donnees = {
      parcoursId: parcours.id,
      code: 'test_migration_diff',
      libelle: 'Avant',
      isAutre: false,
      actif: true,
    }

    const id = await enregistrerCategorie(qui, donnees)
    categoriesCreees.push(id)

    await enregistrerCategorie(qui, { ...donnees, libelle: 'Après' }, id)

    const [trace] = await lignesAudit('categorie.modifie', String(id))

    expect(Object.keys(trace.new_values as Record<string, unknown>)).toEqual(['libelle'])
    expect((trace.old_values as Record<string, unknown>).libelle).toBe('Avant')
    expect((trace.new_values as Record<string, unknown>).libelle).toBe('Après')
  })
})

describe('Sites', () => {
  it('refuse un code de site déjà pris', async () => {
    const qui = await acteur()

    const id = await enregistrerSite(qui, {
      code: 'TEST_MIGRATION_SITE',
      libelle: 'Site de test',
      actif: true,
    })
    sitesCrees.push(id)

    await expect(
      enregistrerSite(qui, { code: 'TEST_MIGRATION_SITE', libelle: 'Autre', actif: true })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })
})

describe('Statuts et canaux — modification seule', () => {
  it('modifie un libellé de statut et le restitue', async () => {
    const qui = await acteur()
    const statut = await prisma.statuts_dossier.findFirstOrThrow({ where: { code: 'recu' } })

    try {
      await modifierStatut(qui, statut.id, {
        libelleInterne: statut.libelle_interne,
        libelleAffiche: 'Libellé de test',
        ordre: statut.ordre,
        // Reconduit tel quel : ce cas porte sur le libellé, pas sur l'activation.
        actif: statut.actif,
      })

      const apres = await prisma.statuts_dossier.findUniqueOrThrow({ where: { id: statut.id } })
      expect(apres.libelle_affiche).toBe('Libellé de test')

      const [trace] = await lignesAudit('statut_dossier.modifie', String(statut.id))
      expect(trace.auditable_type).toBe(MODELES.statutDossier)
    } finally {
      // Ce référentiel est une donnée réelle : remise en l'état quoi qu'il arrive.
      await prisma.statuts_dossier.update({
        where: { id: statut.id },
        data: { libelle_affiche: statut.libelle_affiche },
      })
      await prisma.audit_logs.deleteMany({
        where: { action: 'statut_dossier.modifie', auditable_id: String(statut.id) },
      })
    }
  })

  it('modifie un canal sans exposer sa création ni sa suppression', async () => {
    const qui = await acteur()
    const canal = await prisma.canaux_captage.findFirstOrThrow()

    try {
      await modifierCanal(qui, canal.id, { libelle: 'Canal de test', actif: canal.actif })

      const apres = await prisma.canaux_captage.findUniqueOrThrow({ where: { id: canal.id } })
      expect(apres.libelle).toBe('Canal de test')
    } finally {
      await prisma.canaux_captage.update({
        where: { id: canal.id },
        data: { libelle: canal.libelle },
      })
      await prisma.audit_logs.deleteMany({
        where: { action: 'canal_captage.modifie', auditable_id: String(canal.id) },
      })
    }
  })
})

describe('Rang et suppression (RG-03)', () => {
  /**
   * Le garde-fou d'origine interdisait TOUTE fonction de suppression de référentiel, par son seul
   * nom. Il a été remplacé le 12/09/2026, quand la suppression a été demandée — mais son
   * intention, elle, ne l'a pas été : une entrée citée par l'historique ne part pas.
   *
   * Un test de nom ne pouvait plus l'exprimer, puisque la fonction existe désormais. Ce qui suit
   * vérifie donc le COMPORTEMENT, ce qui est plus fort : le refus est constaté, pas supposé.
   */
  it('REFUSE de supprimer une catégorie citée par un dossier', async () => {
    const qui = await acteur()

    const citee = await prisma.categories.findFirst({
      where: { dossiers: { some: {} } },
      select: { id: true, libelle: true },
    })

    // La base de développement porte de vraies déclarations ; si elle n'en avait aucune, le test
    // ne prouverait rien et doit le dire plutôt que de passer à vide.
    expect(citee, 'aucune catégorie citée par un dossier : cas non couvert').not.toBeNull()

    await expect(supprimerCategorie(qui, citee!.id)).rejects.toBeInstanceOf(ErreurWorkflow)

    // Et elle est toujours là : le refus n'a rien effacé au passage.
    expect(await prisma.categories.findUnique({ where: { id: citee!.id } })).not.toBeNull()
  })

  it('supprime une catégorie que rien ne cite, et le journalise', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const id = await enregistrerCategorie(qui, {
      parcoursId: parcours.id,
      code: 'test_suppression_categorie',
      libelle: 'Catégorie jamais utilisée',
      isAutre: false,
      actif: true,
    })

    await supprimerCategorie(qui, id)

    expect(await prisma.categories.findUnique({ where: { id } })).toBeNull()

    const [trace] = await lignesAudit('categorie.supprimee', String(id))
    expect(trace.auditable_type).toBe(MODELES.categorie)
    // Les valeurs effacées sont consignées : c'est tout ce qui restera de la ligne.
    expect((trace.old_values as Record<string, unknown>).libelle).toBe('Catégorie jamais utilisée')

    await prisma.audit_logs.deleteMany({
      where: { action: 'categorie.supprimee', auditable_id: String(id) },
    })
  })

  it('monte une catégorie d’un rang, et renumérote son parcours', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    // Trois libellés à contre-sens de l'alphabet, pour que le déplacement soit visible : à
    // rangs égaux l'affichage est alphabétique, donc Aaa, Mmm, Zzz.
    const ids: bigint[] = []
    for (const [code, libelle] of [
      ['test_rang_m', 'Mmm rang de test'],
      ['test_rang_a', 'Aaa rang de test'],
      ['test_rang_z', 'Zzz rang de test'],
    ]) {
      const id = await enregistrerCategorie(qui, {
        parcoursId: parcours.id,
        code,
        libelle,
        isAutre: false,
        actif: true,
      })
      ids.push(id)
      categoriesCreees.push(id)
    }

    const nosLignes = async () =>
      (await listerCategories())
        .filter((c) => c.libelle.endsWith('rang de test'))
        .map((c) => c.libelle)

    expect(await nosLignes()).toEqual([
      'Aaa rang de test',
      'Mmm rang de test',
      'Zzz rang de test',
    ])

    // « Zzz » remonte d'un cran : il doit passer DEVANT « Mmm », et l'alphabet ne commande plus.
    const zzz = ids[2]
    await deplacerCategorie(qui, zzz, 'monter')

    expect(await nosLignes()).toEqual([
      'Aaa rang de test',
      'Zzz rang de test',
      'Mmm rang de test',
    ])

    await prisma.audit_logs.deleteMany({
      where: { action: 'categorie.modifie', auditable_id: String(zzz) },
    })
  })

  it('refuse de monter la première ligne d’un groupe', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const premiere = (
      await prisma.categories.findMany({
        where: { parcours_id: parcours.id },
        orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
        select: { id: true },
        take: 1,
      })
    )[0]

    // Le refus vaut mieux qu'un silence : sans lui, le clic renumérote pour rien et l'écran ne
    // bouge pas, ce qui se lit comme une panne.
    await expect(deplacerCategorie(qui, premiere.id, 'monter')).rejects.toBeInstanceOf(
      ErreurWorkflow
    )
  })
})

describe('Organisation — sites et directions', () => {
  it('rattache une direction à un site, et le restitue', async () => {
    const qui = await acteur()

    const siteId = await enregistrerSite(qui, {
      code: 'TEST_MIGRATION_ORG',
      libelle: 'Site de test — organisation',
      actif: true,
    })
    sitesCrees.push(siteId)

    const directionId = await enregistrerDirection(qui, {
      code: 'TEST_MIGRATION_DIR',
      libelle: 'Direction de test',
      siteId,
      actif: true,
    })
    directionsCreees.push(directionId)

    const lignes = await listerDirections()
    const creee = lignes.find((d) => d.id === directionId)

    expect(creee?.site_id).toBe(siteId)
    expect(creee?.sites?.libelle).toBe('Site de test — organisation')

    const trace = await lignesAudit('direction.creee', String(directionId))
    expect(trace).toHaveLength(1)
    expect(trace[0].auditable_type).toBe(MODELES.direction)
  })

  it('refuse un site inconnu au rattachement', async () => {
    const qui = await acteur()

    await expect(
      enregistrerDirection(qui, {
        code: 'TEST_MIGRATION_DIR_2',
        libelle: 'Direction de test',
        siteId: 9_999_999n,
        actif: true,
      })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('refuse de désactiver un site dont des directions dépendent', async () => {
    /**
     * Le site d'un dossier découle de sa direction. Désactiver le site laisserait ces directions
     * pointer vers un rattachement hors service, et les déclarations qui les visent continueraient
     * d'être acheminées vers un site que l'administration croit fermé.
     */
    const qui = await acteur()

    const siteId = await enregistrerSite(qui, {
      code: 'TEST_MIGRATION_ORG_3',
      libelle: 'Site avec directions',
      actif: true,
    })
    sitesCrees.push(siteId)

    const directionId = await enregistrerDirection(qui, {
      code: 'TEST_MIGRATION_DIR_3',
      libelle: 'Direction rattachée',
      siteId,
      actif: true,
    })
    directionsCreees.push(directionId)

    await expect(
      enregistrerSite(qui, { code: 'TEST_MIGRATION_ORG_3', libelle: 'Site avec directions', actif: false }, siteId)
    ).rejects.toThrow(/direction/i)

    // Le site est resté actif : le refus n'a rien laissé à moitié fait.
    const apres = await prisma.sites.findUniqueOrThrow({ where: { id: siteId }, select: { actif: true } })
    expect(apres.actif).toBe(true)

    // Une fois la direction détachée, la désactivation passe.
    await enregistrerDirection(
      qui,
      { code: 'TEST_MIGRATION_DIR_3', libelle: 'Direction rattachée', siteId: null, actif: true },
      directionId
    )

    await enregistrerSite(qui, { code: 'TEST_MIGRATION_ORG_3', libelle: 'Site avec directions', actif: false }, siteId)

    const fin = await prisma.sites.findUniqueOrThrow({ where: { id: siteId }, select: { actif: true } })
    expect(fin.actif).toBe(false)
  })

  it('compte ce qui dépend de chaque site', async () => {
    // Les décomptes affichés doivent dire vrai : c'est sur eux qu'on décide de désactiver ou non.
    const qui = await acteur()

    const siteId = await enregistrerSite(qui, {
      code: 'TEST_MIGRATION_ORG_4',
      libelle: 'Site compté',
      actif: true,
    })
    sitesCrees.push(siteId)

    const directionId = await enregistrerDirection(qui, {
      code: 'TEST_MIGRATION_DIR_4',
      libelle: 'Direction comptée',
      siteId,
      actif: true,
    })
    directionsCreees.push(directionId)

    const site = (await listerSites()).find((s) => s.id === siteId)

    expect(site?._count.directions).toBe(1)
    expect(site?._count.users).toBe(0)
  })
})

describe('Rattachement d’une direction', () => {
  it('déplace une direction d’un site à l’autre, puis la détache', async () => {
    const qui = await acteur()

    const siteA = await enregistrerSite(qui, { code: 'TEST_ORG_A', libelle: 'Site A', actif: true })
    const siteB = await enregistrerSite(qui, { code: 'TEST_ORG_B', libelle: 'Site B', actif: true })
    sitesCrees.push(siteA, siteB)

    const directionId = await enregistrerDirection(qui, {
      code: 'TEST_ORG_DIR',
      libelle: 'Direction mobile',
      siteId: siteA,
      actif: true,
    })
    directionsCreees.push(directionId)

    await rattacherDirection(qui, directionId, siteB)
    expect((await lire(directionId)).site_id).toBe(siteB)

    await rattacherDirection(qui, directionId, null)
    expect((await lire(directionId)).site_id).toBeNull()

    // Deux gestes, deux traces distinctes : un déplacement et un détachement ne se lisent pas de
    // la même façon dans un journal.
    const actions = (
      await prisma.audit_logs.findMany({
        where: { auditable_type: MODELES.direction, auditable_id: String(directionId) },
        orderBy: { id: 'asc' },
        select: { action: true },
      })
    ).map((l) => l.action)

    expect(actions).toContain('direction.rattachee')
    expect(actions).toContain('direction.detachee')
  })

  it('refuse de rattacher à un site désactivé', async () => {
    // Sinon les déclarations visant cette direction partiraient vers un site hors service.
    const qui = await acteur()

    const siteId = await enregistrerSite(qui, {
      code: 'TEST_ORG_INACTIF',
      libelle: 'Site fermé',
      actif: false,
    })
    sitesCrees.push(siteId)

    const directionId = await enregistrerDirection(qui, {
      code: 'TEST_ORG_DIR_2',
      libelle: 'Direction sans site',
      siteId: null,
      actif: true,
    })
    directionsCreees.push(directionId)

    await expect(rattacherDirection(qui, directionId, siteId)).rejects.toThrow(/désactivé/i)
    expect((await lire(directionId)).site_id).toBeNull()
  })

  it('ne fait rien, et ne trace rien, si le rattachement ne change pas', async () => {
    const qui = await acteur()

    const directionId = await enregistrerDirection(qui, {
      code: 'TEST_ORG_DIR_3',
      libelle: 'Direction stable',
      siteId: null,
      actif: true,
    })
    directionsCreees.push(directionId)

    await rattacherDirection(qui, directionId, null)

    const traces = await prisma.audit_logs.count({
      where: {
        auditable_type: MODELES.direction,
        auditable_id: String(directionId),
        action: { in: ['direction.rattachee', 'direction.detachee'] },
      },
    })

    // Un journal qui consigne des non-événements devient illisible.
    expect(traces).toBe(0)
  })
})

async function lire(directionId: bigint) {
  return prisma.directions.findUniqueOrThrow({
    where: { id: directionId },
    select: { site_id: true },
  })
}
