import { prisma } from '@/lib/prisma'
import { MODELES } from '@/server/modeles'

/**
 * Boîte de réception « outil »
 *
 * Ne produit aucune donnée : `envoyerNotification()` écrit déjà dans la table `notifications`
 * dans une colonne `data` en JSON. Ce module en est le seul lecteur, et conserve ce
 * format pour que les deux applications restent interopérables pendant la migration.
 */

const NOTIFIABLE_USER = MODELES.utilisateur
const LIMITE_APERCU = 8

export type NotificationVue = {
  id: string
  objet: string
  corps: string
  recueLe: string
  lue: boolean
}

/** `data` est stockée en JSON sérialisé : une ligne illisible ne doit pas casser la boîte. */
function contenu(data: string): { objet: string; corps: string } {
  try {
    const decode: unknown = JSON.parse(data)

    if (typeof decode === 'object' && decode !== null) {
      const enregistrement = decode as Record<string, unknown>
      return {
        objet: typeof enregistrement.objet === 'string' ? enregistrement.objet : 'Notification',
        corps: typeof enregistrement.corps === 'string' ? enregistrement.corps : '',
      }
    }
  } catch {
    // Ligne corrompue ou écrite par une version antérieure : dégradation silencieuse.
  }

  return { objet: 'Notification', corps: '' }
}

export async function notificationsRecentes(utilisateurId: bigint): Promise<NotificationVue[]> {
  const lignes = await prisma.notifications.findMany({
    where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: utilisateurId },
    orderBy: { created_at: 'desc' },
    take: LIMITE_APERCU,
    select: { id: true, data: true, read_at: true, created_at: true },
  })

  return lignes.map((n) => ({
    id: n.id,
    ...contenu(n.data),
    recueLe: (n.created_at ?? new Date()).toISOString(),
    lue: n.read_at !== null,
  }))
}

export async function nombreNonLues(utilisateurId: bigint): Promise<number> {
  return prisma.notifications.count({
    where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: utilisateurId, read_at: null },
  })
}

/**
 * Le filtre porte aussi sur le destinataire : sans lui, un identifiant de notification deviné
 * permettrait de marquer lue celle d'un autre utilisateur.
 */
export async function marquerLue(utilisateurId: bigint, notificationId: string): Promise<void> {
  await prisma.notifications.updateMany({
    where: {
      id: notificationId,
      notifiable_type: NOTIFIABLE_USER,
      notifiable_id: utilisateurId,
      read_at: null,
    },
    data: { read_at: new Date(), updated_at: new Date() },
  })
}

export async function toutMarquerLu(utilisateurId: bigint): Promise<void> {
  await prisma.notifications.updateMany({
    where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: utilisateurId, read_at: null },
    data: { read_at: new Date(), updated_at: new Date() },
  })
}
