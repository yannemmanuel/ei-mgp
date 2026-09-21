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

/**
 * Comptes créés par ce fichier — supprimés à la fin, et eux seuls.
 *
 * ⚠️ CRÉÉS PLUTÔT QUE CHERCHÉS, depuis le 2026-09-21. Ce fichier prenait le premier chargé de
 * sécurité rattaché à une direction qu'il trouvait en base. Le jour où un administrateur a
 * déplacé ce compte sur un site, le cas n'a plus rien trouvé et s'est mis à échouer — sur un
 * paramétrage parfaitement légitime, et sans qu'aucun défaut n'existe.
 *
 * Un cas qui dépend de la configuration du jour ne prouve rien de stable : il pose donc lui-même
 * la situation qu'il exerce.
 */
const comptes: bigint[] = []

const MODEL_TYPE_USER = String.raw`App\Models\User`

afterAll(async () => {
  await nettoyerDossiers(dossiers)

  /*
    Les liens d'abord, les comptes ensuite, et bornés à leurs seuls identifiants : un filtre plus
    large — par nom approchant, par date — finirait par emporter un compte réel.
  */
  if (comptes.length > 0) {
    await prisma.model_has_roles.deleteMany({
      where: { model_type: MODEL_TYPE_USER, model_id: { in: comptes } },
    })
    await prisma.users.deleteMany({ where: { id: { in: comptes } } })
  }
})

/** Un chargé de sécurité RÉEL, rattaché à une direction — `personnesEnCharge()` lit la base. */
async function compteChargeSurUneDirection(): Promise<bigint> {
  const direction = await prisma.directions.findFirstOrThrow({
    where: { actif: true },
    select: { id: true },
  })

  const role = await prisma.roles.findFirstOrThrow({
    where: { name: 'charge_securite', guard_name: 'web' },
    select: { id: true },
  })

  const compte = await prisma.users.create({
    data: {
      name: 'Chargé de sécurité (vérification)',
      email: `zz.charge.${process.pid}.${Date.now()}@exemple.test`,
      actif: true,
      direction_id: direction.id,
      doit_changer_mot_de_passe: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true, direction_id: true },
  })

  comptes.push(compte.id)

  await prisma.model_has_roles.create({
    data: { role_id: role.id, model_id: compte.id, model_type: MODEL_TYPE_USER },
  })

  return compte.direction_id as bigint
}

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

      ⚠️ ET IL EST CRÉÉ ICI, plus cherché en base — voir `compteChargeSurUneDirection()`. Le
      chercher faisait dépendre le cas du paramétrage du jour, et il a fini par ne plus rien
      trouver.
    */
    const directionId = await compteChargeSurUneDirection()

    // Lu par un transverse : le périmètre ne doit rien masquer de ce qu'on vérifie ici.
    const transverse = utilisateurAvecRoles('service_mgp')
    const avant = await aTraiter(transverse)

    await eiSurLaDirection(directionId)

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

  it('ne met rien sur la carte de qui LIT sans traiter', async () => {
    /*
      La contrepartie : voir les dossiers ne veut pas dire en répondre.

      ⚠️ `auditeur`, et non un rôle transverse quelconque. Ce qui sépare le traitant du lecteur
      est le droit de FAIRE AVANCER un dossier : le Service MGP le porte — il traite —, l'auditeur
      non. Prendre `service_mgp` ici ferait échouer ce cas sur une règle qu'il ne porte pas.
    */
    const direction = await prisma.directions.findFirstOrThrow({ select: { id: true } })
    const dossierId = await eiSurLaDirection(direction.id)

    const apercu = await dossiersATraiter(utilisateurAvecRoles('auditeur'))
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
