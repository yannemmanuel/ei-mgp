import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { changerStatut } from '../../dossier/workflow'
import { reaffecter } from '../../dossier/affectation'
import { estEnRetard, joursRestants, viderCacheDelais } from '../../dossier/delais'
import { detecterRetards, relancerEcheances } from '../taches-planifiees'
import { definirTransportEmail, TransportJournal, type MessageEmail } from '../transport'

/**
 * Port de `tests/Feature/Console/RelancerEcheancesTest.php` et `DetecterRetardsTest.php`.
 *
 * Ces tâches parcourent TOUS les dossiers actifs de la base : les assertions portent donc sur le
 * dossier créé par le test, jamais sur un compteur global qui dépendrait des données existantes.
 */
const dossiersCrees: string[] = []
const gabaritsCrees: bigint[] = []
let emails: MessageEmail[] = []

class TransportCapture {
  async envoyer(message: MessageEmail): Promise<void> {
    emails.push(message)
  }
}

async function creerGabarit(evenementCode: string): Promise<void> {
  const gabarit = await prisma.notification_templates.create({
    data: {
      evenement_code: evenementCode,
      parcours_id: null,
      canal: 'email',
      objet: `[${evenementCode}] {reference}`,
      corps: 'Corps de test.',
      actif: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })
  gabaritsCrees.push(gabarit.id)
}

/** Amène un dossier en « En analyse » avec un titulaire, puis force l'échéance voulue. */
async function dossierAvecEcheance(acteurId: bigint): Promise<string> {
  const categorie = await categoriePour('grief_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'grief_employe',
    canalCaptageCode: 'qr_code',
    anonyme: true,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
  })
  dossiersCrees.push(dossierId)

  const actuel = await prisma.dossiers.findUniqueOrThrow({
    where: { id: dossierId },
    select: { statuts_dossier: { select: { code: true } } },
  })

  if (actuel.statuts_dossier.code === 'recu') {
    await reaffecter({
      dossierId,
      nouvelUtilisateurId: acteurId,
      effectueParId: acteurId,
      motif: 'Prise en charge pour test.',
    })
  }

  await changerStatut({ dossierId, vers: 'en_analyse', acteurId })
  return dossierId
}

/**
 * Évènements effectivement notifiés pour ce dossier.
 *
 * Compter toutes les lignes `notification.envoyee` ne suffit pas : la mise en place du dossier
 * (affectation puis changement de statut) en produit déjà, depuis que les gabarits existent.
 */
async function evenementsNotifies(dossierId: string): Promise<string[]> {
  const lignes = await prisma.audit_logs.findMany({
    where: { auditable_id: dossierId, action: 'notification.envoyee' },
    select: { new_values: true },
  })

  return lignes.map((l) => String((l.new_values as Record<string, unknown>).evenement_code))
}

/** Décale l'entrée dans l'étape courante pour simuler une échéance donnée. */
async function reculerDebutEtape(dossierId: string, jours: number): Promise<void> {
  const date = new Date()
  date.setDate(date.getDate() - jours)

  await prisma.historique_statuts.updateMany({
    where: { dossier_id: dossierId },
    data: { created_at: date },
  })
}

beforeEach(() => {
  emails = []
  viderCacheDelais()
  definirTransportEmail(new TransportCapture())
})

afterEach(async () => {
  definirTransportEmail(new TransportJournal())

  if (gabaritsCrees.length > 0) {
    await prisma.notification_templates.deleteMany({ where: { id: { in: gabaritsCrees } } })
    gabaritsCrees.length = 0
  }
  if (dossiersCrees.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { auditable_id: { in: dossiersCrees } } })
  }
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Relance J-3 (EX-NOT-03)', () => {
  it('relance si et seulement s’il reste exactement 3 jours', async () => {
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
    const dossierId = await dossierAvecEcheance(acteur.id)
    await creerGabarit('relance_echeance')

    const dossier = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { parcours_id: true, statuts_dossier: { select: { code: true } } },
    })

    // On mesure d'abord le reste réel : le delai est en JOURS OUVRES, sa conversion en jours
    // calendaires depend du jour de la semaine. Affirmer une valeur en dur rendrait ce test
    // vert ou rouge selon la date d'execution.
    const restants = await joursRestants({
      id: dossierId,
      statutCode: dossier.statuts_dossier.code as 'en_analyse',
      parcoursId: dossier.parcours_id,
    })

    await relancerEcheances()

    const relances = (await evenementsNotifies(dossierId)).filter(
      (e) => e === 'relance_echeance'
    ).length

    // C'est l'invariant qui est teste, pas un agencement de calendrier particulier.
    expect(relances > 0).toBe(restants === 3)
  })

  it('ne relance pas un dossier dont l’échéance est largement dépassée', async () => {
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
    const dossierId = await dossierAvecEcheance(acteur.id)
    await creerGabarit('relance_echeance')

    // Tres en retard : la relance J-3 ne doit pas se declencher retroactivement, c'est
    // l'escalade (EX-NOT-04) qui prend le relais.
    await reculerDebutEtape(dossierId, 90)

    await relancerEcheances()

    expect(await evenementsNotifies(dossierId)).not.toContain('relance_echeance')
  })
})

describe('Escalade des retards (EX-NOT-04)', () => {
  it('alerte le Service MGP dès l’échéance dépassée', async () => {
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
    const dossierId = await dossierAvecEcheance(acteur.id)

    await creerGabarit('alerte_retard_service_mgp')
    await creerGabarit('alerte_retard_n1')

    // Recule largement l'entrée dans l'étape : l'échéance est nécessairement dépassée.
    await reculerDebutEtape(dossierId, 90)

    await detecterRetards()

    // Le dossier a bien été détecté en retard ; le Service MGP est alerté s'il existe des comptes
    // porteurs du rôle (ce qui est le cas dans la base de développement).
    expect(await evenementsNotifies(dossierId)).toContain('alerte_retard_service_mgp')
  })

  it('n’alerte pas un dossier dont l’échéance n’est pas dépassée', async () => {
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
    const dossierId = await dossierAvecEcheance(acteur.id)
    await creerGabarit('alerte_retard_service_mgp')

    await detecterRetards()

    const evenements = await evenementsNotifies(dossierId)
    expect(evenements).not.toContain('alerte_retard_service_mgp')
    expect(evenements).not.toContain('alerte_retard_n1')
  })
})

describe('Délai global (CDC §11.2, DT-23)', () => {
  it('escalade un dossier qui dépasse l’enveloppe totale, même à jour sur son étape', async () => {
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
    const dossierId = await dossierAvecEcheance(acteur.id)

    await creerGabarit('alerte_retard_service_mgp')

    // L'étape vient de commencer : son échéance est devant nous. Seul le délai global — mesuré
    // depuis la CRÉATION — est dépassé. C'est le cas que la surveillance par étape laissait
    // passer : un dossier qui tient chacun de ses jalons et s'éternise malgré tout.
    const trenteSeptMois = new Date()
    trenteSeptMois.setMonth(trenteSeptMois.getMonth() - 37)

    await prisma.dossiers.update({
      where: { id: dossierId },
      data: { created_at: trenteSeptMois },
    })

    const contexte = await prisma.dossiers.findUniqueOrThrow({
      where: { id: dossierId },
      select: { parcours_id: true, statuts_dossier: { select: { code: true } } },
    })

    expect(
      await estEnRetard({
        id: dossierId,
        statutCode: contexte.statuts_dossier.code as 'en_analyse',
        parcoursId: contexte.parcours_id,
      })
    ).toBe(false)

    await detecterRetards()

    expect(await evenementsNotifies(dossierId)).toContain('alerte_retard_service_mgp')
  })

  it('n’escalade pas un dossier dans son enveloppe', async () => {
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
    const dossierId = await dossierAvecEcheance(acteur.id)

    await creerGabarit('alerte_retard_service_mgp')
    await detecterRetards()

    expect(await evenementsNotifies(dossierId)).not.toContain('alerte_retard_service_mgp')
  })
})
