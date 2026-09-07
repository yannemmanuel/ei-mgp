import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import {
  categoriePour,
  graviteParNiveau,
  nettoyerAudit,
  nettoyerDossiers,
} from '../../declaration/__tests__/aide-base'
import { reaffecter } from '../../dossier/affectation'
import { changerStatut } from '../../dossier/workflow'
import { definirTransportEmail, TransportJournal, type MessageEmail } from '../transport'

/**
 * Évènements métier déclencheurs de notification (EX-NOT-01, EX-NOT-02, EX-NOT-05).
 *
 * Les tests existants couvraient le MOTEUR (résolution de gabarit, substitution, canaux). Ceux-ci
 * couvrent le CÂBLAGE : qu'une affectation, un changement de statut ou une déclaration critique
 * déclenchent effectivement un envoi. Un moteur correct branché sur rien n'envoie rien — et c'est
 * exactement l'état dans lequel se trouvait la baseline, faute de gabarits.
 */
const MODEL_TYPE_DOSSIER = String.raw`App\Models\Dossier`
const dossiersCrees: string[] = []
let emails: MessageEmail[] = []

class TransportCapture {
  async envoyer(message: MessageEmail): Promise<void> {
    emails.push(message)
  }
}

async function evenementsNotifies(dossierId: string): Promise<string[]> {
  const lignes = await prisma.audit_logs.findMany({
    where: {
      auditable_type: MODEL_TYPE_DOSSIER,
      auditable_id: dossierId,
      action: 'notification.envoyee',
    },
    select: { new_values: true },
  })

  return lignes.map((l) => String((l.new_values as Record<string, unknown>).evenement_code))
}

async function nouvelleDeclaration(
  options: { niveau?: number; declarantUserId?: bigint } = {}
): Promise<string> {
  const categorie = await categoriePour('grief_employe')
  const gravite = await graviteParNiveau(options.niveau ?? 1)
  const identifie = options.declarantUserId !== undefined

  const { dossierId } = await creerDeclaration({
    parcours: 'grief_employe',
    canalCaptageCode: 'qr_code',
    anonyme: !identifie,
    donneesDossier: {
      categorieId: categorie.id,
      niveauGraviteId: gravite.id,
      description: 'Description factuelle de test suffisamment longue.',
      ...(identifie ? { declarantUserId: options.declarantUserId } : {}),
    },
    ...(identifie
      ? { donneesIdentite: { nomPrenom: 'Déclarant identifié', contactEmail: 'declarant@example.test' } }
      : {}),
  })

  dossiersCrees.push(dossierId)
  return dossierId
}

/** Amène le dossier jusqu'à un titulaire, préalable à toute transition. */
async function prendreEnCharge(dossierId: string, acteurId: bigint): Promise<void> {
  await reaffecter({
    dossierId,
    nouvelUtilisateurId: acteurId,
    effectueParId: acteurId,
    motif: 'Prise en charge pour test.',
  })
}

beforeEach(() => {
  emails = []
  definirTransportEmail(new TransportCapture())
})

afterEach(async () => {
  definirTransportEmail(new TransportJournal())
  await nettoyerAudit(MODEL_TYPE_DOSSIER, dossiersCrees)
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('EX-NOT-01 — notification à l’affectation', () => {
  it('notifie le nouveau titulaire lors d’une réaffectation', async () => {
    const dossierId = await nouvelleDeclaration()
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

    await prendreEnCharge(dossierId, acteur.id)

    expect(await evenementsNotifies(dossierId)).toContain('dossier_affecte')
  })
})

describe('EX-NOT-02 — notification au changement de statut', () => {
  it('notifie le déclarant IDENTIFIÉ à chaque transition', async () => {
    // Deux comptes distincts : DT-06 interdit d'affecter un déclarant au traitement de son
    // propre dossier, et cette règle s'applique aussi aux données de test.
    const [declarant, traitant] = await prisma.users.findMany({
      where: { actif: true },
      take: 2,
      select: { id: true },
      orderBy: { id: 'asc' },
    })

    const dossierId = await nouvelleDeclaration({ declarantUserId: declarant.id })

    await prendreEnCharge(dossierId, traitant.id)

    const avant = (await evenementsNotifies(dossierId)).filter((e) => e === 'statut_change').length

    await changerStatut({ dossierId, vers: 'en_analyse', acteurId: traitant.id })

    const apres = (await evenementsNotifies(dossierId)).filter((e) => e === 'statut_change').length

    expect(apres).toBeGreaterThan(avant)
  })

  it('ne notifie PERSONNE sur un dossier anonyme (RG-06)', async () => {
    const dossierId = await nouvelleDeclaration()
    const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

    await prendreEnCharge(dossierId, acteur.id)
    await changerStatut({ dossierId, vers: 'en_analyse', acteurId: acteur.id })

    // Il n'existe aucun destinataire à qui écrire : c'est la garantie d'anonymat qui l'impose,
    // pas un oubli de configuration. Une notification de statut exigerait une adresse, donc une
    // identité.
    expect(await evenementsNotifies(dossierId)).not.toContain('statut_change')
  })
})

describe('EX-NOT-05 / RG-08 — circuit accéléré', () => {
  it('déclenche l’alerte critique dès la soumission, sans attendre de traitement', async () => {
    // Gravité 4 = « Critique » : l'alerte doit partir pendant la création elle-même. RG-08 exige
    // le synchrone — une file d'attente rendrait le délai de 24 h intenable.
    const dossierId = await nouvelleDeclaration({ niveau: 4 })

    expect(await evenementsNotifies(dossierId)).toContain('circuit_critique')
  })

  it('ne déclenche pas le circuit accéléré pour une gravité ordinaire', async () => {
    const dossierId = await nouvelleDeclaration({ niveau: 1 })

    expect(await evenementsNotifies(dossierId)).not.toContain('circuit_critique')
  })
})
