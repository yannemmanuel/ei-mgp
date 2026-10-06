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
  href: string | null
}

/** `data` est stockée en JSON sérialisé : une ligne illisible ne doit pas casser la boîte. */
function contenu(data: string): {
  objet: string
  corps: string
  href: string | null
  reference: string | null
} {
  try {
    const decode: unknown = JSON.parse(data)

    if (typeof decode === 'object' && decode !== null) {
      const enregistrement = decode as Record<string, unknown>
      const dossierId =
        typeof enregistrement.dossier_id === 'string' ? enregistrement.dossier_id : null
      const objet = typeof enregistrement.objet === 'string' ? enregistrement.objet : 'Notification'
      const corps = typeof enregistrement.corps === 'string' ? enregistrement.corps : ''
      return {
        objet,
        corps,
        // Une destination interne est reconstruite côté serveur : aucune URL arbitraire stockée
        // dans le JSON ne peut transformer la cloche en redirection externe.
        href: dossierId && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(dossierId)
          ? `/dossiers/${dossierId}`
          : null,
        // Rétrocompatibilité : les anciennes notifications n'avaient pas `dossier_id`, mais les
        // gabarits plaçaient toujours la référence métier dans l'objet ou le corps.
        reference: `${objet} ${corps}`.match(/\b[A-Z0-9]+-\d{4}-\d{6}\b/i)?.[0] ?? null,
      }
    }
  } catch {
    // Ligne corrompue ou écrite par une version antérieure : dégradation silencieuse.
  }

  return { objet: 'Notification', corps: '', href: null, reference: null }
}

export async function notificationsRecentes(utilisateurId: bigint): Promise<NotificationVue[]> {
  const lignes = await prisma.notifications.findMany({
    where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: utilisateurId },
    orderBy: { created_at: 'desc' },
    take: LIMITE_APERCU,
    select: { id: true, data: true, read_at: true, created_at: true },
  })

  const decodees = lignes.map((n) => ({ ligne: n, contenu: contenu(n.data) }))
  const references = decodees
    .filter((n) => n.contenu.href === null && n.contenu.reference !== null)
    .map((n) => n.contenu.reference as string)
  const dossiers = references.length === 0
    ? []
    : await prisma.dossiers.findMany({
        where: { reference: { in: references } },
        select: { id: true, reference: true },
      })
  const hrefParReference = new Map(dossiers.map((d) => [d.reference.toUpperCase(), `/dossiers/${d.id}`]))

  return decodees.map(({ ligne, contenu: notification }) => ({
    id: ligne.id,
    objet: notification.objet,
    corps: notification.corps,
    href:
      notification.href ??
      (notification.reference
        ? (hrefParReference.get(notification.reference.toUpperCase()) ?? null)
        : null),
    recueLe: (ligne.created_at ?? new Date()).toISOString(),
    lue: ligne.read_at !== null,
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
