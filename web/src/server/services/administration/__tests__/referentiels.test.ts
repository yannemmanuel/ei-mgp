import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { nettoyerAudit } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  enregistrerCategorie,
  enregistrerDirection,
  enregistrerSite,
  listerCategories,
  listerDirections,
  listerSites,
  modifierCanal,
  rattacherDirection,
  modifierStatut,
} from '../referentiels'

/**
 * Référentiels d'administration — port des composants `App\Livewire\Administration\*`.
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
  await nettoyerAudit('App\Models\Categorie', categoriesCreees)
  await nettoyerAudit('App\Models\Site', sitesCrees)
  if (categoriesCreees.length > 0) {
    await prisma.categories.deleteMany({ where: { id: { in: categoriesCreees } } })
    categoriesCreees.length = 0
  }
  // Les directions partent AVANT les sites : la clé étrangère l'exige.
  await nettoyerAudit(String.raw`App\Models\Direction`, directionsCreees)
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
  it('crée une catégorie et l’audite au format Laravel', async () => {
    const qui = await acteur()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    const id = await enregistrerCategorie(qui, {
      parcoursId: parcours.id,
      code: 'test_migration_categorie',
      libelle: 'Catégorie de test',
      isAutre: false,
      actif: true,
      ordre: 99,
    })
    categoriesCreees.push(id)

    const [trace] = await lignesAudit('categorie.cree', String(id))

    expect(trace).toBeDefined()
    // Le nom de classe PHP doit être exact : la console d'audit de Laravel filtre dessus.
    expect(trace.auditable_type).toBe('App\\Models\\Categorie')
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
      ordre: 98,
    })
    categoriesCreees.push(id)

    await expect(
      enregistrerCategorie(qui, {
        parcoursId: parcours.id,
        code: 'test_migration_doublon',
        libelle: 'Seconde',
        isAutre: false,
        actif: true,
        ordre: 97,
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
        ordre: 96,
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
      ordre: 95,
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
      ordre: 94,
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
      })

      const apres = await prisma.statuts_dossier.findUniqueOrThrow({ where: { id: statut.id } })
      expect(apres.libelle_affiche).toBe('Libellé de test')

      const [trace] = await lignesAudit('statut_dossier.modifie', String(statut.id))
      expect(trace.auditable_type).toBe('App\\Models\\StatutDossier')
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

describe('Absence de suppression (RG-03)', () => {
  it('n’expose aucune fonction de suppression de référentiel', async () => {
    const exportes = await import('../referentiels')
    const noms = Object.keys(exportes)

    // Garde-fou structurel : si une suppression apparaît un jour, ce test le signale avant que
    // l'intégrité d'un historique n'en dépende.
    expect(noms.filter((n) => /supprimer|delete|retirer/i.test(n))).toEqual([])
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
    expect(trace[0].auditable_type).toBe(String.raw`App\Models\Direction`)
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
        where: { auditable_type: String.raw`App\Models\Direction`, auditable_id: String(directionId) },
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
        auditable_type: String.raw`App\Models\Direction`,
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
