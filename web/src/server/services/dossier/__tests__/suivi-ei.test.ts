import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ROLES, chargerUtilisateurAutorise, peutVoirParcours, parcoursAutorises } from '@/server/authz'
import { perimetreDossiers } from '../liste'
import { dateLimite } from '../delais'
import { estEvenementIndesirable, personnesEnCharge, suiviEi } from '../suivi-ei'

/**
 * Le nouveau circuit de l'évènement indésirable.
 *
 * Il n'est plus affecté à personne : le chargé de sécurité du site le voit et le traite. Trois
 * choses doivent tenir ensemble, et chacune casse silencieusement sans les autres — il voit les
 * évènements de son site, il ne voit pas ceux des autres, et le dossier garde une échéance
 * malgré l'absence d'affectation.
 */
const comptesCrees: bigint[] = []

async function compteCharge(
  siteId: bigint | null,
  directionId: bigint | null = null
): Promise<bigint> {
  const role = await prisma.roles.findFirstOrThrow({
    where: { name: 'charge_securite', guard_name: 'web' },
  })

  const compte = await prisma.users.create({
    data: {
      name: 'Chargé de sécurité de test',
      email: `test-cs-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
      // Empreinte inutilisable : ce compte ne sert jamais à s'authentifier.
      password: 'x'.repeat(60),
      actif: true,
      site_id: siteId,
      direction_id: directionId,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })

  comptesCrees.push(compte.id)

  await prisma.model_has_roles.create({
    data: { role_id: role.id, model_type: String.raw`App\Models\User`, model_id: compte.id },
  })
  await prisma.utilisateur_parcours.create({
    data: {
      user_id: compte.id,
      parcours_id: (await prisma.parcours.findFirstOrThrow({ where: { code: 'ei_employe' } })).id,
    },
  })

  return compte.id
}

// ⚠️ Borné aux comptes fabriqués ici : jamais de suppression large sur `users`.
afterAll(async () => {
  if (comptesCrees.length === 0) return

  await prisma.utilisateur_parcours.deleteMany({ where: { user_id: { in: comptesCrees } } })
  await prisma.model_has_roles.deleteMany({ where: { model_id: { in: comptesCrees } } })
  await prisma.users.deleteMany({ where: { id: { in: comptesCrees } } })
})

describe('Le chargé de sécurité voit les évènements de son site', () => {
  it('les voit sans qu’aucun ne lui soit affecté', async () => {
    const site = await prisma.sites.findFirstOrThrow({ select: { id: true } })
    const compte = (await chargerUtilisateurAutorise(await compteCharge(site.id)))!

    expect(parcoursAutorises(compte)).toEqual(['ei_employe'])
    expect(peutVoirParcours(compte, 'ei_employe')).toBe(true)

    const visibles = await prisma.dossiers.count({
      where: { AND: [perimetreDossiers(compte), { parcours: { code: 'ei_employe' } }] },
    })
    const surSonSite = await prisma.dossiers.count({
      where: { parcours: { code: 'ei_employe' }, site_id: site.id },
    })

    expect(visibles, 'le périmètre ne correspond pas aux évènements de son site').toBe(surSonSite)

    // Et AUCUNE affectation n'a été nécessaire pour cela : c'est tout le principe du circuit.
    const affectations = await prisma.dossier_affectations.count({
      where: { user_id: compte.id, actif: true },
    })
    expect(affectations, 'le circuit repose encore sur une affectation').toBe(0)
  })

  it('ne voit AUCUN grief', async () => {
    // Le cloisonnement dans l'autre sens : son rôle n'ouvre que l'évènement indésirable.
    const compte = (await chargerUtilisateurAutorise(await compteCharge(null)))!

    for (const code of ['grief_employe', 'grief_sous_traitant', 'grief_communaute'] as const) {
      expect(peutVoirParcours(compte, code), code).toBe(false)
    }
  })

  it('ne peut affecter le dossier à personne', () => {
    /*
      Demandé explicitement : « il voit tous les EI de son site et ne peut pas les affecter à qui
      que ce soit ». La garantie est dans les PERMISSIONS du rôle, pas dans un écran — un bouton
      masqué se contourne par un appel direct, une permission absente ne se contourne pas.
    */
    expect(compteEstSansDroitDAffectation()).toBe(true)
  })
})

function compteEstSansDroitDAffectation(): boolean {
  // Lu depuis la définition de référence : le rôle ne doit porter ni `assign` ni `reassign`.
  const droits = ROLES.charge_securite as readonly string[]

  return !droits.includes('dossiers.assign') && !droits.includes('dossiers.reassign')
}

describe('L’évènement garde une échéance sans affectation', () => {
  it('calcule un délai depuis la réception', async () => {
    /*
      Le piège de ce changement. L'échéance se calculait depuis l'entrée en « affecté » ; sans
      affectation, l'évènement serait resté indéfiniment à l'heure — aucune relance, aucune
      escalade, et rien à afficher là où le métier demande précisément de voir le délai.

      ⚠️ L'évènement est CRÉÉ ici. Chercher un dossier existant à « reçu » ne prouvait rien : il
      n'y en a aucun en base, et le cas se terminait sans avoir rien vérifié — précisément le
      genre de test vert qui laisse passer la régression qu'il prétend garder.
    */
    const { etapeActuelle } = await import('../delais')
    expect(etapeActuelle('recu'), '« reçu » n’entre dans aucune étape suivie').toBe(
      'analyse_preliminaire'
    )

    const { creerDeclaration } = await import('../../declaration/creer-declaration')
    const { categoriePour, graviteParNiveau, nettoyerDossiers } = await import(
      '../../declaration/__tests__/aide-base'
    )

    const categorie = await categoriePour('ei_employe')
    const cree = await creerDeclaration({
      parcours: 'ei_employe',
      canalCaptageCode: 'qr_code',
      anonyme: true,
      donneesDossier: {
        categorieId: categorie.id,
        niveauGraviteId: (await graviteParNiveau(1)).id,
        description: 'Évènement de test pour le calcul d’échéance.',
        dateSurvenance: new Date(),
      },
    })

    try {
      const dossier = await prisma.dossiers.findUniqueOrThrow({
        where: { id: cree.dossierId },
        select: { parcours_id: true, statuts_dossier: { select: { code: true } } },
      })

      // Il n'a été affecté à personne — c'est le nouveau circuit — et reste donc à « reçu ».
      expect(dossier.statuts_dossier.code, 'l’évènement a été affecté').toBe('recu')

      const limite = await dateLimite({
        id: cree.dossierId,
        statutCode: 'recu',
        parcoursId: dossier.parcours_id,
      })

      expect(limite, 'un évènement non affecté n’a aucune échéance').not.toBeNull()
      expect(limite!.getTime(), 'l’échéance précède la création').toBeGreaterThan(
        Date.now() - 86_400_000
      )
    } finally {
      await nettoyerDossiers([cree.dossierId])
    }
  })
})

describe('Le bloc de suivi', () => {
  it('ne s’affiche que sur l’évènement indésirable', () => {
    expect(estEvenementIndesirable('ei_employe')).toBe(true)
    for (const code of ['grief_employe', 'grief_sous_traitant', 'grief_communaute']) {
      expect(estEvenementIndesirable(code), code).toBe(false)
    }
  })

  it('retient le chargé DU site, et pas celui d’un autre', async () => {
    const sites = await prisma.sites.findMany({ take: 2, select: { id: true } })
    if (sites.length < 2) return // un seul site en base : le cloisonnement ne se démontre pas

    const [a, b] = sites
    const chargeDeA = await compteCharge(a.id)

    expect(
      (await personnesEnCharge({ parcoursCode: 'ei_employe', siteId: a.id, directionId: null })).map((c) => c.id),
      'le chargé du site n’est pas retenu sur son propre site'
    ).toContainEqual(chargeDeA)

    expect(
      (await personnesEnCharge({ parcoursCode: 'ei_employe', siteId: b.id, directionId: null })).map((c) => c.id),
      'le chargé d’un site est proposé sur un autre'
    ).not.toContainEqual(chargeDeA)
  })

  it('retient un chargé SANS rattachement sur n’importe quel dossier', async () => {
    /*
      Cohérent avec `siteCloisonnant()`, et volontaire : faute de rattachement, ce compte n'est
      borné à rien et VOIT donc réellement ce dossier. L'écarter ici ferait dire à la fiche que
      personne n'en répond alors que quelqu'un le traite — le pire des deux affichages.

      C'est aussi pourquoi la console des comptes signale « rattachement manquant » : la bonne
      correction est de rattacher le compte, pas de le masquer.
    */
    const sansRattachement = await compteCharge(null)
    const site = await prisma.sites.findFirstOrThrow({ select: { id: true } })

    expect(
      (await personnesEnCharge({ parcoursCode: 'ei_employe', siteId: site.id, directionId: null })).map((c) => c.id)
    ).toContainEqual(sansRattachement)
  })

  it('⚠️ retient le chargé habilité sur la DIRECTION de la déclaration', async () => {
    /*
      ⚠️ LE CAS QUI A ÉTÉ REMONTÉ. Une déclaration déposée sur une direction, un chargé de
      sécurité habilité sur cette direction — et la fiche annonçait que personne ne s'en occupait.

      La sélection ne regardait que `site_id`. Un compte habilité sur une direction porte
      `site_id` à null : il n'était donc retenu que par la branche « sans rattachement », et
      seulement quand le dossier avait un site. Sur un dossier rattaché à une direction sans site,
      il n'était jamais retenu.
    */
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    const autre = await prisma.directions.findFirst({
      where: { id: { not: direction.id } },
      select: { id: true },
    })

    const chargeDeLaDirection = await compteCharge(null, direction.id)

    expect(
      (await personnesEnCharge({ parcoursCode: 'ei_employe', siteId: null, directionId: direction.id })).map((c) => c.id),
      'le chargé habilité sur cette direction n’est pas retenu'
    ).toContainEqual(chargeDeLaDirection)

    if (autre) {
      expect(
        (await personnesEnCharge({ parcoursCode: 'ei_employe', siteId: null, directionId: autre.id })).map((c) => c.id),
        'il est proposé sur une AUTRE direction'
      ).not.toContainEqual(chargeDeLaDirection)
    }
  })

  it('⚠️ retient quelqu’un sur un dossier SANS site', async () => {
    /*
      ⚠️ LA BRANCHE QUI N'ÉTAIT PAS TESTÉE, et c'est précisément celle qui était cassée.

      La sélection écrivait `OR: [{}]` pour « tous les comptes » quand le dossier n'avait pas de
      site. Dans Prisma, un objet vide dans un `OR` ne correspond à RIEN, pas à tout : la fiche
      répondait « personne » sur tous ces dossiers — c'est-à-dire sur la majorité d'entre eux, la
      plupart des directions n'étant rattachées à aucun site.
    */
    const sansRattachement = await compteCharge(null)

    expect(
      (await personnesEnCharge({ parcoursCode: 'ei_employe', siteId: null, directionId: null })).map((c) => c.id),
      'aucun chargé n’est retenu sur un dossier sans site'
    ).toContainEqual(sansRattachement)
  })

  it('résume le plan d’action sans jamais compter une action close comme ouverte', async () => {
    const dossier = await prisma.dossiers.findFirstOrThrow({
      where: { parcours: { code: 'ei_employe' } },
      select: { id: true, site_id: true, direction_id: true },
    })

    const suivi = await suiviEi(dossier.id)
    const reelles = await prisma.actions_correctives.findMany({
      where: { dossier_id: dossier.id },
      select: { statut: true },
    })

    expect(suivi.actionsTotal).toBe(reelles.length)
    expect(suivi.actionsOuvertes).toBe(reelles.filter((a) => a.statut !== 'realisee').length)
    expect(suivi.actionsOuvertes).toBeLessThanOrEqual(suivi.actionsTotal)
  })
})
