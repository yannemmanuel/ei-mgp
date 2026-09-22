import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  marquerLue,
  nombreNonLues,
  notificationsRecentes,
  toutMarquerLu,
} from '../boite'
import { MODELES } from '@/server/modeles'

/** Port de `App\Livewire\Notifications\NotificationCenter`. */
const NOTIFIABLE_USER = MODELES.utilisateur
const creees: string[] = []

async function deuxUtilisateurs(): Promise<[bigint, bigint]> {
  const utilisateurs = await prisma.users.findMany({ take: 2, select: { id: true }, orderBy: { id: 'asc' } })
  return [utilisateurs[0].id, utilisateurs[1].id]
}

async function deposer(utilisateurId: bigint, objet: string, data?: string): Promise<string> {
  const id = randomUUID()

  await prisma.notifications.create({
    data: {
      id,
      type: String.raw`App\Notifications\DossierEvenementNotification`,
      notifiable_type: NOTIFIABLE_USER,
      notifiable_id: utilisateurId,
      data: data ?? JSON.stringify({ evenement_code: 'test', objet, corps: 'Corps de test.' }),
      created_at: new Date(),
      updated_at: new Date(),
    },
  })

  creees.push(id)
  return id
}

afterEach(async () => {
  if (creees.length > 0) {
    await prisma.notifications.deleteMany({ where: { id: { in: creees } } })
    creees.length = 0
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Boîte de réception « outil »', () => {
  it('ne renvoie que les notifications du destinataire', async () => {
    const [moi, autre] = await deuxUtilisateurs()

    const mienne = await deposer(moi, 'Pour moi')
    await deposer(autre, 'Pour un autre')

    const miennes = await notificationsRecentes(moi)
    expect(miennes.map((n) => n.id)).toContain(mienne)
    expect(miennes.map((n) => n.objet)).not.toContain('Pour un autre')
  })

  it('ne laisse pas marquer lue la notification d’un autre utilisateur', async () => {
    const [moi, autre] = await deuxUtilisateurs()
    const sienne = await deposer(autre, 'Pour un autre')

    // Identifiant deviné ou récupéré : la session doit primer sur ce que fournit l'appelant.
    await marquerLue(moi, sienne)

    const apres = await prisma.notifications.findUniqueOrThrow({ where: { id: sienne } })
    expect(apres.read_at).toBeNull()
  })

  it('compte et solde les non-lues du seul destinataire', async () => {
    const [moi, autre] = await deuxUtilisateurs()

    // `toutMarquerLu` touche TOUTES les non-lues du compte, y compris celles que le test n'a pas
    // créées : on les relève pour les rétablir ensuite, sinon le test modifierait durablement la
    // base sur laquelle il tourne.
    const preexistantes = await prisma.notifications.findMany({
      where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: moi, read_at: null },
      select: { id: true },
    })

    const avant = preexistantes.length
    const a = await deposer(moi, 'A')
    const b = await deposer(moi, 'B')
    const sienne = await deposer(autre, 'Pour un autre')

    expect(await nombreNonLues(moi)).toBe(avant + 2)

    try {
      await toutMarquerLu(moi)

      expect(await nombreNonLues(moi)).toBe(0)

      for (const id of [a, b]) {
        const lue = await prisma.notifications.findUniqueOrThrow({ where: { id } })
        expect(lue.read_at).not.toBeNull()
      }

      const inchangee = await prisma.notifications.findUniqueOrThrow({ where: { id: sienne } })
      expect(inchangee.read_at).toBeNull()
    } finally {
      await prisma.notifications.updateMany({
        where: { id: { in: preexistantes.map((n) => n.id) } },
        data: { read_at: null },
      })
    }
  })

  it('affiche une ligne illisible sans casser la boîte', async () => {
    const [moi] = await deuxUtilisateurs()
    const id = await deposer(moi, 'ignoré', 'ceci n’est pas du JSON')

    const trouvee = (await notificationsRecentes(moi)).find((n) => n.id === id)
    expect(trouvee?.objet).toBe('Notification')
    expect(trouvee?.corps).toBe('')
  })
})
