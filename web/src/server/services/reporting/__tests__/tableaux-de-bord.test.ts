import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import type { UtilisateurAutorise } from '@/server/authz'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { aTraiter, dossiersATraiter } from '../a-traiter'
import { listerDossiers } from '../../dossier/liste'
import { clauseFiltre, filtreDepuisParametres } from '../filtre'
import { historiqueMensuel } from '../statistiques-mensuelles'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'

/**
 * Ce que les tableaux de bord doivent dire depuis que la charge ne vient plus seulement d'une
 * affectation.
 *
 * Un évènement indésirable n'est affecté à personne : il revient au chargé de sécurité dont le
 * rattachement le couvre. Trois blocs le lisaient à travers `dossier_affectations` et disaient
 * donc le contraire de la vérité — « aucun dossier ne vous est affecté » à celui qui les traite,
 * et « personne ne les traite » sur chaque EI.
 */
const dossiers: string[] = []

afterAll(async () => {
  await nettoyerDossiers(dossiers)
})

/** Un EI déposé sur la direction voulue. */
async function eiSurLaDirection(directionId: bigint | null): Promise<string> {
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
      directionId,
    },
  })

  dossiers.push(dossierId)
  return dossierId
}

function chargeSurLaDirection(directionId: bigint): UtilisateurAutorise {
  return { ...utilisateurAvecRoles('charge_securite'), siteId: null, directionId }
}

describe('⚠️ « Vos dossiers à traiter » compte les EI du rattachement', () => {
  it('compte un EI de sa direction, bien qu’il ne lui soit pas affecté', async () => {
    /*
      ⚠️ LE DÉFAUT QUE CE CAS PROTÈGE : `miens` ne comptait que `dossier_affectations`. Comme aucun
      EI n'y figure jamais, le chargé de sécurité voyait « Aucun dossier ne vous est affecté » —
      alors que c'est précisément lui qui doit les traiter.
    */
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    const dossierId = await eiSurLaDirection(direction.id)

    // Aucune affectation : c'est la prémisse même du cas, et il ne prouverait rien sans elle.
    expect(
      await prisma.dossier_affectations.count({ where: { dossier_id: dossierId, actif: true } }),
      'l’EI a reçu une affectation : le cas ne prouverait rien'
    ).toBe(0)

    const resultat = await aTraiter(chargeSurLaDirection(direction.id))

    expect(resultat.miens, 'l’EI de sa direction ne lui est pas compté').toBeGreaterThan(0)
  })

  it('ne compte pas l’EI d’une AUTRE direction', async () => {
    /*
      ⚠️ MESURÉ AVANT/APRÈS, et non comparé à un total absolu.

      La base porte déjà des dossiers : comparer `miens` au seul nombre de dossiers créés ici
      faisait échouer le cas dès qu'un EI préexistant relevait de cette direction — un échec qui
      n'aurait rien dit du cloisonnement.
    */
    const directions = await prisma.directions.findMany({ select: { id: true }, take: 2 })
    if (directions.length < 2) return // une seule direction : le cloisonnement ne se démontre pas

    const [ici, ailleurs] = directions
    const lecteur = chargeSurLaDirection(ailleurs.id)

    const avant = await aTraiter(lecteur)
    await eiSurLaDirection(ici.id)
    const apres = await aTraiter(lecteur)

    expect(
      apres.miens,
      'un EI déposé sur une AUTRE direction est compté comme sien'
    ).toBe(avant.miens)
  })

  it('⚠️ ne compte pas un EI comme « non affecté » quand quelqu’un en répond', async () => {
    /*
      Un EI n'a JAMAIS de ligne d'affectation. Compter les dossiers « reçus sans destinataire »
      sans le savoir signalait chaque EI comme abandonné — un compteur d'alerte qui crie toujours
      finit par n'être plus lu.
    */
    /*
      ⚠️ LE COMPTE DOIT ÊTRE UN CHARGÉ DE SÉCURITÉ, pas n'importe quel compte rattaché à une
      direction. Prendre le premier venu faisait porter le cas sur un compte transverse, qui ne
      répond d'aucun EI : l'échec venait alors du choix du compte, pas de la règle.
    */
    const porteurs = await prisma.model_has_roles.findMany({
      where: {
        model_type: String.raw`App\Models\User`,
        roles: { name: 'charge_securite', guard_name: 'web', actif: true },
      },
      select: { model_id: true },
    })

    const compte = await prisma.users.findFirst({
      where: { actif: true, direction_id: { not: null }, id: { in: porteurs.map((p) => p.model_id) } },
      select: { direction_id: true },
    })

    expect(
      compte?.direction_id,
      'aucun chargé de sécurité habilité sur une direction : le cas ne prouverait rien'
    ).toBeDefined()
    if (!compte?.direction_id) return

    // Lu par un transverse : le périmètre ne doit rien masquer de ce qu'on vérifie ici.
    const transverse = utilisateurAvecRoles('service_mgp')
    const avant = await aTraiter(transverse)

    await eiSurLaDirection(compte.direction_id)

    const apres = await aTraiter(transverse)

    expect(
      apres.nonAffectes,
      'un EI dont un chargé de sécurité répond est compté comme non affecté'
    ).toBe(avant.nonAffectes)
  })
})

describe('⚠️ La carte, son lien et le compteur disent la MÊME chose', () => {
  /*
    Trois surfaces répondaient à « quels dossiers sont les miens » — l'aperçu de la carte, la liste
    ouverte par son lien, et le compteur — et chacune le décidait de son côté. Ce cas les croise :
    une divergence se verrait comme un chiffre qui ne correspond pas à ce qu'on découvre en
    cliquant.
  */
  it('l’aperçu de la carte et la liste « assignés à moi » contiennent les mêmes dossiers', async () => {
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    await eiSurLaDirection(direction.id)

    const lecteur = chargeSurLaDirection(direction.id)

    const apercu = await dossiersATraiter(lecteur)
    const { dossiers: listes } = await listerDossiers(lecteur, { assigneAMoi: true }, 1)

    expect(apercu.length, 'l’aperçu est vide : le cas ne prouverait rien').toBeGreaterThan(0)

    const referencesListees = new Set(listes.map((d) => d.reference))

    for (const d of apercu) {
      expect(
        referencesListees.has(d.reference),
        `${d.reference} figure sur la carte mais pas dans la liste qu’elle ouvre`
      ).toBe(true)
    }
  })

  it('⚠️ la carte n’est pas vide pour un chargé de sécurité', async () => {
    // Le symptôme exact : « Aucun dossier ne vous revient » chez celui qui les traite.
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    await eiSurLaDirection(direction.id)

    const apercu = await dossiersATraiter(chargeSurLaDirection(direction.id))

    expect(apercu.length, 'la carte reste vide alors qu’un EI relève de sa direction').toBeGreaterThan(0)
  })

  it('ne met rien sur la carte d’un transverse qui ne traite pas les EI', async () => {
    /*
      La contrepartie : voir tous les EI ne veut pas dire en répondre. Un compte transverse qui
      n'est pas chargé de sécurité ne doit pas les voir arriver dans « vos dossiers », sans quoi la
      carte perd tout sens pour lui.
    */
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    const dossierId = await eiSurLaDirection(direction.id)

    const apercu = await dossiersATraiter(utilisateurAvecRoles('service_mgp'))
    const reference = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { reference: true },
    })

    expect(apercu.map((d) => d.reference)).not.toContain(reference.reference)
  })
})

describe('⚠️ Le reporting plafonne aussi par rattachement', () => {
  it('borne la clause sur la direction du lecteur, pas seulement sur ses parcours', () => {
    const direction = 42n
    const filtre = filtreDepuisParametres({}, chargeSurLaDirection(direction))

    expect(filtre.directionDuLecteur, 'la direction du lecteur n’est pas relevée').toBe(direction)
    expect(clauseFiltre(filtre).direction_id).toBe(direction)
  })

  it('⚠️ ne laisse pas un paramètre d’URL élargir ce plafond', () => {
    /*
      ⚠️ CE QUI COMPTE EST QU'ON NE PUISSE PAS ÉLARGIR, pas qu'on ne puisse pas restreindre.

      `?directionId=7` doit être sans effet : le plafond reste 42. `?siteId=999` s'ajoute en ET et
      ne peut que rétrécir — l'interdire n'apporterait rien et priverait d'un filtre légitime.
    */
    const filtre = filtreDepuisParametres(
      { siteId: '999', directionId: '7' },
      chargeSurLaDirection(42n)
    )
    const clause = clauseFiltre(filtre)

    expect(clause.direction_id, 'l’URL a écrasé le plafond de direction').toBe(42n)
  })

  it('ne plafonne rien pour un lecteur transverse', () => {
    const filtre = filtreDepuisParametres({}, utilisateurAvecRoles('service_mgp'))

    expect(filtre.siteDuLecteur).toBeNull()
    expect(filtre.directionDuLecteur).toBeNull()
    expect(clauseFiltre(filtre).site_id).toBeUndefined()
  })
})

describe('⚠️ L’historique mensuel ne ment pas à un lecteur cloisonné', () => {
  it('ne renvoie rien plutôt que des totaux tous rattachements confondus', async () => {
    // `statistiques_mensuelles` n'agrège que par parcours : le rattachement n'y est pas. Afficher
    // ces lignes à un lecteur borné contredirait les chiffres du haut de la même page.
    expect(await historiqueMensuel(['ei_employe'], true)).toEqual([])
  })

  it('le renvoie normalement à un lecteur non borné', async () => {
    const lignes = await historiqueMensuel(['ei_employe'], false)

    expect(Array.isArray(lignes)).toBe(true)
  })
})
