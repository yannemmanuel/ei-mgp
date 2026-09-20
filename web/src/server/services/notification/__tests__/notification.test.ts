import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { envoyerNotification, type Destinataire } from '../notification'
import { definirTransportEmail, TransportJournal, type MessageEmail } from '../transport'

/**
 * Port de `tests/Feature/Services/NotificationServiceTest.php` et
 * `NotificationServiceAuditTest.php` (Laravel).
 *
 * Les gabarits sont créés par le test lui-même : la base de développement n'en contient aucun,
 * et dépendre d'un jeu de données préexistant rendrait ces tests muets sans le signaler.
 */
const dossiersCrees: string[] = []
const gabaritsCrees: bigint[] = []
let emailsCaptures: MessageEmail[] = []

/** Transport de test : capture au lieu d'envoyer. */
class TransportCapture {
  async envoyer(message: MessageEmail): Promise<void> {
    emailsCaptures.push(message)
  }
}

async function creerGabarit(params: {
  evenementCode: string
  canal: 'outil' | 'email'
  objet: string
  corps: string
  parcoursId?: bigint | null
  emailsSupplementaires?: string[]
}): Promise<void> {
  const gabarit = await prisma.notification_templates.create({
    data: {
      evenement_code: params.evenementCode,
      parcours_id: params.parcoursId ?? null,
      canal: params.canal,
      objet: params.objet,
      corps: params.corps,
      actif: true,
      destinataires_email_supplementaires: params.emailsSupplementaires ?? undefined,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true },
  })
  gabaritsCrees.push(gabarit.id)
}

async function nouveauDossier(anonyme = true): Promise<string> {
  const categorie = await categoriePour('ei_employe')
  const gravite = await graviteParNiveau(1)

  const { dossierId } = await creerDeclaration({
    parcours: 'ei_employe',
    canalCaptageCode: 'qr_code',
    anonyme,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
    },
    donneesIdentite: anonyme ? undefined : { nomPrenom: 'Awa Koffi' },
  })

  dossiersCrees.push(dossierId)

  /*
    ⚠️ LA CAPTURE EST VIDÉE ICI, et ce n'est pas une commodité.

    Créer une déclaration NOTIFIE désormais ses titulaires (EX-NOT-01) : depuis que plus rien
    n'est affecté, ils se déduisent du rattachement et l'appel n'est plus conditionnel. Ces
    courriels-là sont légitimes, mais ils ne sont pas l'objet de ces cas — laissés dans la
    capture, ils s'ajoutaient à ceux que le cas envoie lui-même, et « un seul courriel attendu »
    en comptait quatre.
  */
  emailsCaptures.length = 0

  return dossierId
}

async function unUtilisateur(): Promise<Destinataire> {
  const u = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true, email: true } })
  return { type: 'utilisateur', id: u.id, email: u.email }
}

beforeEach(() => {
  emailsCaptures = []
  definirTransportEmail(new TransportCapture())
})

afterEach(async () => {
  definirTransportEmail(new TransportJournal())

  if (gabaritsCrees.length > 0) {
    await prisma.notification_templates.deleteMany({ where: { id: { in: gabaritsCrees } } })
    gabaritsCrees.length = 0
  }
  if (dossiersCrees.length > 0) {
    await prisma.notifications.deleteMany({ where: { type: { contains: 'DossierEvenement' } } })
    await prisma.audit_logs.deleteMany({ where: { auditable_id: { in: dossiersCrees } } })
  }
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Envoi piloté par gabarit', () => {
  it('substitue les jetons de contexte dans l’objet et le corps', async () => {
    const dossierId = await nouveauDossier()
    await creerGabarit({
      evenementCode: 'test_jetons',
      canal: 'email',
      objet: 'Dossier {reference}',
      corps: 'Parcours {parcours} — statut {statut}.',
    })

    await envoyerNotification({
      evenementCode: 'test_jetons',
      dossierId,
      destinataires: [await unUtilisateur()],
      contexte: { statut: 'En cours d’analyse' },
    })

    expect(emailsCaptures).toHaveLength(1)
    expect(emailsCaptures[0].objet).toMatch(/^Dossier EI-\d{4}-\d{6}$/)
    expect(emailsCaptures[0].corps).toContain('statut En cours d’analyse')
    expect(emailsCaptures[0].corps).not.toContain('{parcours}')
  })

  it('crée une ligne « outil » lisible par Laravel', async () => {
    const dossierId = await nouveauDossier()
    const destinataire = await unUtilisateur()

    await creerGabarit({
      evenementCode: 'test_outil',
      canal: 'outil',
      objet: 'Objet outil',
      corps: 'Corps outil',
    })

    await envoyerNotification({
      evenementCode: 'test_outil',
      dossierId,
      destinataires: [destinataire],
    })

    /*
      ⚠️ FILTRÉ SUR L'ÉVÈNEMENT, et non « la plus récente ».

      Créer la déclaration notifie désormais ses titulaires, qui peuvent être ce même compte : la
      ligne la plus récente était alors celle de `dossier_affecte`, pas celle que ce cas envoie.
    */
    const notification = await prisma.notifications.findFirstOrThrow({
      where: {
        notifiable_id: destinataire.type === 'utilisateur' ? destinataire.id : 0n,
        data: { contains: 'test_outil' },
      },
      orderBy: { created_at: 'desc' },
    })

    expect(notification.type).toContain('DossierEvenementNotification')
    expect(notification.notifiable_type).toBe('App\\Models\\User')
    expect(JSON.parse(notification.data)).toMatchObject({
      evenement_code: 'test_outil',
      objet: 'Objet outil',
    })
    // Aucun e-mail : le canal « outil » n'écrit qu'en base.
    expect(emailsCaptures).toHaveLength(0)
  })

  it('préfère le gabarit spécifique au parcours au gabarit global', async () => {
    const dossierId = await nouveauDossier()
    const parcours = await prisma.parcours.findFirstOrThrow({ where: { code: 'ei_employe' } })

    await creerGabarit({
      evenementCode: 'test_priorite',
      canal: 'email',
      objet: 'GLOBAL',
      corps: 'global',
      parcoursId: null,
    })
    await creerGabarit({
      evenementCode: 'test_priorite',
      canal: 'email',
      objet: 'SPECIFIQUE',
      corps: 'spécifique',
      parcoursId: parcours.id,
    })

    await envoyerNotification({
      evenementCode: 'test_priorite',
      dossierId,
      destinataires: [await unUtilisateur()],
    })

    expect(emailsCaptures).toHaveLength(1)
    expect(emailsCaptures[0].objet).toBe('SPECIFIQUE')
  })

  it('n’envoie rien et ne lève pas si aucun gabarit actif n’existe', async () => {
    const dossierId = await nouveauDossier()

    const envoyees = await envoyerNotification({
      evenementCode: 'evenement_sans_gabarit',
      dossierId,
      destinataires: [await unUtilisateur()],
    })

    expect(envoyees).toBe(0)
    expect(emailsCaptures).toHaveLength(0)
  })

  it('ajoute les destinataires e-mail supplémentaires du gabarit (DT-28)', async () => {
    const dossierId = await nouveauDossier()

    await creerGabarit({
      evenementCode: 'test_supplementaires',
      canal: 'email',
      objet: 'Objet',
      corps: 'Corps',
      emailsSupplementaires: ['prevention@example.test'],
    })

    await envoyerNotification({
      evenementCode: 'test_supplementaires',
      dossierId,
      destinataires: [await unUtilisateur()],
    })

    expect(emailsCaptures.map((e) => e.destinataire)).toContain('prevention@example.test')
  })

  it('ignore une adresse brute sur le canal « outil » — elle n’a pas de boîte applicative', async () => {
    const dossierId = await nouveauDossier()

    await creerGabarit({
      evenementCode: 'test_outil_brut',
      canal: 'outil',
      objet: 'Objet',
      corps: 'Corps',
    })

    const envoyees = await envoyerNotification({
      evenementCode: 'test_outil_brut',
      dossierId,
      destinataires: [{ type: 'email', adresse: 'externe@example.test' }],
    })

    expect(envoyees).toBe(0)
  })
})

describe('Audit des envois (exigences-audit.md §2 et §5)', () => {
  it('audite l’envoi avec évènement, canal et destinataire', async () => {
    const dossierId = await nouveauDossier(false)

    await creerGabarit({
      evenementCode: 'test_audit',
      canal: 'email',
      objet: 'Objet auditable',
      corps: 'Corps',
    })

    await envoyerNotification({
      evenementCode: 'test_audit',
      dossierId,
      destinataires: [await unUtilisateur()],
    })

    const journal = await prisma.audit_logs.findFirstOrThrow({
      where: { action: 'notification.envoyee', auditable_id: dossierId },
      orderBy: { id: 'desc' },
    })

    const valeurs = journal.new_values as Record<string, unknown>
    expect(valeurs.evenement_code).toBe('test_audit')
    expect(valeurs.canal).toBe('email')
    expect(valeurs.destinataire).toBeTruthy()
    // Dossier NON anonyme : l'objet est conservé.
    expect(valeurs.objet).toBe('Objet auditable')
  })

  it('n’enregistre JAMAIS le contenu pour un dossier anonyme (RG-06, §5)', async () => {
    const dossierId = await nouveauDossier(true)

    await creerGabarit({
      evenementCode: 'test_audit_anonyme',
      canal: 'email',
      objet: 'Contenu sensible',
      corps: 'Corps',
    })

    await envoyerNotification({
      evenementCode: 'test_audit_anonyme',
      dossierId,
      destinataires: [await unUtilisateur()],
    })

    const journal = await prisma.audit_logs.findFirstOrThrow({
      where: { action: 'notification.envoyee', auditable_id: dossierId },
      orderBy: { id: 'desc' },
    })

    const valeurs = journal.new_values as Record<string, unknown>
    expect(valeurs.evenement_code).toBe('test_audit_anonyme')
    // Le journal ne doit pas devenir une voie de réidentification du déclarant.
    expect(valeurs.objet).toBeUndefined()
    expect(JSON.stringify(valeurs)).not.toContain('Contenu sensible')
  })
})
