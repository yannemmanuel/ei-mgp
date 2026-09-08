import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles, utilisateurDuSite } from '@/server/authz/__tests__/aide'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { listerDossiers } from '../liste'

/**
 * Du choix d'une direction jusqu'à l'écran d'un secrétaire.
 *
 * La chaîne complète : le déclarant désigne une direction, la direction porte un site, le dossier
 * en hérite, et seuls les comptes de ce site le voient. Chaque maillon existait séparément ; c'est
 * leur enchaînement qui décide si un signalement atteint quelqu'un.
 */
const crees: string[] = []

/** Site rendu à sa valeur d'origine après chaque cas : ce sont des référentiels réels. */
const rattachementsInitiaux = new Map<bigint, bigint | null>()

async function rattacher(directionId: bigint, siteId: bigint | null) {
  if (!rattachementsInitiaux.has(directionId)) {
    const avant = await prisma.directions.findUniqueOrThrow({
      where: { id: directionId },
      select: { site_id: true },
    })
    rattachementsInitiaux.set(directionId, avant.site_id)
  }

  await prisma.directions.update({ where: { id: directionId }, data: { site_id: siteId } })
}

afterEach(async () => {
  await nettoyerDossiers(crees)
  crees.length = 0

  for (const [directionId, site_id] of rattachementsInitiaux) {
    await prisma.directions.update({ where: { id: directionId }, data: { site_id } })
  }
  rattachementsInitiaux.clear()
})

async function declarerAvecDirection(directionId: bigint | null): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      directionId,
      description: 'Extincteur vide, atelier 3.',
    },
  })

  crees.push(dossierId)
  return dossierId
}

describe('Le site d’un dossier découle de la direction', () => {
  it('reprend le site de la direction choisie', async () => {
    const [site, direction] = await Promise.all([
      prisma.sites.findFirstOrThrow({ select: { id: true } }),
      prisma.directions.findFirstOrThrow({ select: { id: true } }),
    ])

    await rattacher(direction.id, site.id)
    const dossierId = await declarerAvecDirection(direction.id)

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { site_id: true, direction_id: true },
    })

    expect(dossier.direction_id).toBe(direction.id)
    expect(dossier.site_id).toBe(site.id)
  })

  it('laisse le site vide quand la direction n’est rattachée à rien', async () => {
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })

    await rattacher(direction.id, null)
    const dossierId = await declarerAvecDirection(direction.id)

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { site_id: true },
    })

    expect(dossier.site_id).toBeNull()
  })

  it('conserve la direction d’une déclaration ANONYME', async () => {
    // Le point qui décide de tout : la direction était mise à NULL pour une déclaration anonyme.
    // Un signalement anonyme n'aurait donc jamais eu de site, et n'aurait atteint aucun secrétaire
    // habilité par site — l'inverse exact de ce que l'anonymat sert à obtenir. Une direction
    // compte des centaines de personnes : la connaître n'identifie personne.
    const [site, direction] = await Promise.all([
      prisma.sites.findFirstOrThrow({ select: { id: true } }),
      prisma.directions.findFirstOrThrow({ select: { id: true } }),
    ])

    await rattacher(direction.id, site.id)
    const dossierId = await declarerAvecDirection(direction.id)

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { is_anonymous: true, site_id: true },
    })

    expect(dossier.is_anonymous).toBe(true)
    expect(dossier.site_id).toBe(site.id)

    // Et l'anonymat tient : aucune ligne d'identité n'a été créée.
    const identite = await prisma.declaration_identites.count({ where: { dossier_id: dossierId } })
    expect(identite).toBe(0)
  })
})

describe('Ce que voit un secrétaire habilité par site', () => {
  it('voit les dossiers de son site, pas ceux d’un autre', async () => {
    const sites = await prisma.sites.findMany({ orderBy: { id: 'asc' }, take: 2, select: { id: true } })
    expect(sites.length, 'il faut deux sites pour ce cas').toBe(2)

    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    await rattacher(direction.id, sites[0].id)
    const dossierId = await declarerAvecDirection(direction.id)

    const duBonSite = await listerDossiers(utilisateurDuSite(sites[0].id, 'secretaire_csst'), {}, 1)
    const dAilleurs = await listerDossiers(utilisateurDuSite(sites[1].id, 'secretaire_csst'), {}, 1)

    expect(duBonSite.dossiers.some((d) => d.id === dossierId)).toBe(true)
    expect(dAilleurs.dossiers.some((d) => d.id === dossierId)).toBe(false)
  })

  it('ne voit pas un dossier dont la direction n’a pas de site', async () => {
    const site = await prisma.sites.findFirstOrThrow({ select: { id: true } })
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })

    await rattacher(direction.id, null)
    const dossierId = await declarerAvecDirection(direction.id)

    const { dossiers } = await listerDossiers(utilisateurDuSite(site.id, 'secretaire_csst'), {}, 1)

    expect(dossiers.some((d) => d.id === dossierId)).toBe(false)
  })

  it('reste visible d’un compte sans site, et des rôles transverses', async () => {
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    await rattacher(direction.id, null)
    const dossierId = await declarerAvecDirection(direction.id)

    // Un secrétaire sans site n'est pas cloisonné : un paramétrage incomplet ne vide pas un écran.
    const sansSite = await listerDossiers(utilisateurAvecRoles('secretaire_csst'), {}, 1)
    const transverse = await listerDossiers(utilisateurAvecRoles('service_mgp'), {}, 1)

    expect(sansSite.dossiers.some((d) => d.id === dossierId)).toBe(true)
    expect(transverse.dossiers.some((d) => d.id === dossierId)).toBe(true)
  })
})
