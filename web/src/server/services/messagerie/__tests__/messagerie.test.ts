import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { creerDeclaration } from '../../declaration/creer-declaration'
import { categoriePour, graviteParNiveau, nettoyerDossiers } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import { envoyerMessage, marquerMessagesLus, messagesDuDossier } from '../messagerie'

const dossiersCrees: string[] = []

async function nouveauDossierAnonyme(): Promise<string> {
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
    },
  })

  dossiersCrees.push(dossierId)
  return dossierId
}

afterEach(async () => {
  await nettoyerDossiers(dossiersCrees)
  dossiersCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Messagerie sécurisée (EX-NOT-07)', () => {
  it('enregistre un message d’agent avec son compte', async () => {
    const dossierId = await nouveauDossierAnonyme()
    const agent = await prisma.users.findFirstOrThrow({ select: { id: true } })

    await envoyerMessage({
      dossierId,
      expediteur: 'agent',
      corps: 'Merci de préciser la date exacte des faits.',
      expediteurUserId: agent.id,
    })

    const [message] = await messagesDuDossier(dossierId)
    expect(message.expediteur_type).toBe('agent')
    expect(message.users?.name).toBeTruthy()
  })

  it('n’attache JAMAIS de compte à un message de déclarant, même si un id est fourni (RG-06)', async () => {
    const dossierId = await nouveauDossierAnonyme()
    const compte = await prisma.users.findFirstOrThrow({ select: { id: true } })

    await envoyerMessage({
      dossierId,
      expediteur: 'declarant',
      corps: 'Je souhaite ajouter une précision.',
      // Fourni volontairement : le service doit l'ignorer, pas s'en remettre à l'appelant.
      expediteurUserId: compte.id,
    })

    const messages = await prisma.messages.findMany({ where: { dossier_id: dossierId } })
    expect(messages).toHaveLength(1)
    expect(messages[0].expediteur_user_id).toBeNull()
  })

  it('refuse un message vide ou trop long', async () => {
    const dossierId = await nouveauDossierAnonyme()

    await expect(
      envoyerMessage({ dossierId, expediteur: 'declarant', corps: ' ' })
    ).rejects.toBeInstanceOf(ErreurWorkflow)

    await expect(
      envoyerMessage({ dossierId, expediteur: 'declarant', corps: 'a'.repeat(2001) })
    ).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('liste les messages des deux parties dans l’ordre chronologique', async () => {
    const dossierId = await nouveauDossierAnonyme()
    const agent = await prisma.users.findFirstOrThrow({ select: { id: true } })

    await envoyerMessage({ dossierId, expediteur: 'declarant', corps: 'Premier message.' })
    await envoyerMessage({
      dossierId,
      expediteur: 'agent',
      corps: 'Réponse de l’agent.',
      expediteurUserId: agent.id,
    })

    const messages = await messagesDuDossier(dossierId)
    expect(messages.map((m) => m.expediteur_type)).toEqual(['declarant', 'agent'])
  })

  it('ne marque comme lus que les messages de l’autre partie', async () => {
    const dossierId = await nouveauDossierAnonyme()
    const agent = await prisma.users.findFirstOrThrow({ select: { id: true } })

    await envoyerMessage({ dossierId, expediteur: 'declarant', corps: 'Message du déclarant.' })
    await envoyerMessage({
      dossierId,
      expediteur: 'agent',
      corps: 'Message de l’agent.',
      expediteurUserId: agent.id,
    })

    // Un agent ouvre le panneau : il lit le message du déclarant, pas le sien.
    await marquerMessagesLus(dossierId, 'agent')

    const messages = await prisma.messages.findMany({ where: { dossier_id: dossierId } })
    const declarant = messages.find((m) => m.expediteur_type === 'declarant')
    const propre = messages.find((m) => m.expediteur_type === 'agent')

    expect(declarant?.lu_le).not.toBeNull()
    expect(propre?.lu_le).toBeNull()
  })
})
