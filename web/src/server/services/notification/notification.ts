import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { transportEmail } from './transport'

/**
 * Envoi de notifications piloté par gabarit (Module 5, EX-NOT-01 à 05) — port de
 * `App\Services\Notification\NotificationService`.
 *
 * Résout le ou les gabarits actifs pour un évènement × parcours, substitue les jetons de
 * contexte, puis distribue vers les canaux « outil » (table `notifications`) et « email ».
 *
 * La résolution des DESTINATAIRES (qui reçoit quoi) reste la responsabilité de l'appelant, pas
 * de ce service : elle dépend de règles métier propres à chaque évènement.
 */

/** Nom de classe attendu par Laravel dans `notifications.type` — compatibilité pendant la migration. */
const TYPE_NOTIFICATION = String.raw`App\Notifications\DossierEvenementNotification`
const NOTIFIABLE_USER = String.raw`App\Models\User`

export type Destinataire =
  | { readonly type: 'utilisateur'; readonly id: bigint; readonly email: string }
  /** Adresse brute, hors RBAC (destinataires supplémentaires d'un gabarit — DT-28). */
  | { readonly type: 'email'; readonly adresse: string }

type Gabarit = {
  canal: string
  objet: string
  corps: string
  destinataires_email_supplementaires: unknown
}

/**
 * Un seul gabarit actif par canal : celui spécifique au parcours prime sur le gabarit global.
 * Le tri place le global en premier pour que le spécifique l'écrase.
 */
async function gabaritsActifsParCanal(evenementCode: string, parcoursId: bigint): Promise<Gabarit[]> {
  const gabarits = await prisma.notification_templates.findMany({
    where: {
      evenement_code: evenementCode,
      actif: true,
      OR: [{ parcours_id: parcoursId }, { parcours_id: null }],
    },
    select: {
      canal: true,
      objet: true,
      corps: true,
      parcours_id: true,
      destinataires_email_supplementaires: true,
    },
  })

  const parCanal = new Map<string, Gabarit>()

  for (const g of [...gabarits].sort((a) => (a.parcours_id === null ? -1 : 1))) {
    parCanal.set(g.canal, g)
  }

  return [...parCanal.values()]
}

function substituer(texte: string, jetons: Record<string, string>): string {
  return Object.entries(jetons).reduce(
    (resultat, [cle, valeur]) => resultat.split(`{${cle}}`).join(valeur),
    texte
  )
}

/**
 * Envoie une notification à un ensemble de destinataires.
 *
 * RG-08 : l'envoi est SYNCHRONE. Laravel met en file par défaut et contourne explicitement la
 * file pour le circuit accéléré ; ici tout est immédiat, ce qui satisfait RG-08 a fortiori.
 * Une file resterait souhaitable à fort volume pour les notifications non critiques — consigné
 * comme risque ouvert, mais ne peut pas être un raccourci pour le circuit critique.
 */
export async function envoyerNotification(params: {
  evenementCode: string
  dossierId: string
  destinataires: readonly Destinataire[]
  contexte?: Record<string, string>
}): Promise<number> {
  const dossier = await prisma.dossiers.findUniqueOrThrow({
    where: { id: params.dossierId },
    select: {
      id: true,
      reference: true,
      is_anonymous: true,
      parcours_id: true,
      parcours: { select: { libelle: true } },
    },
  })

  const gabarits = await gabaritsActifsParCanal(params.evenementCode, dossier.parcours_id)

  if (gabarits.length === 0) {
    // Journalisé plutôt que silencieux : un évènement sans gabarit actif est une anomalie de
    // configuration, pas un cas nominal.
    console.warn(
      `NotificationService : aucun gabarit actif pour l'évènement « ${params.evenementCode} » (dossier ${dossier.reference}).`
    )
    return 0
  }

  const jetons: Record<string, string> = {
    reference: dossier.reference,
    parcours: dossier.parcours.libelle,
    ...(params.contexte ?? {}),
  }

  let envoyees = 0

  for (const gabarit of gabarits) {
    const objet = substituer(gabarit.objet, jetons)
    const corps = substituer(gabarit.corps, jetons)

    if (gabarit.canal === 'outil') {
      // Le canal « outil » ne s'adresse qu'à des comptes : une adresse brute n'a pas de boîte
      // de réception dans l'application.
      for (const d of params.destinataires) {
        if (d.type !== 'utilisateur') continue
        await creerNotificationOutil(d.id, params.evenementCode, objet, corps)
        await auditerEnvoi(dossier, params.evenementCode, 'outil', d.email, objet)
        envoyees += 1
      }
      continue
    }

    for (const d of params.destinataires) {
      const adresse = d.type === 'utilisateur' ? d.email : d.adresse
      if (await expedier(dossier, params.evenementCode, adresse, objet, corps)) envoyees += 1
    }

    // DT-28 : destinataires hors RBAC déclarés sur le gabarit (Service Prévention, Directions…).
    for (const adresse of adressesSupplementaires(gabarit)) {
      if (await expedier(dossier, params.evenementCode, adresse, objet, corps)) envoyees += 1
    }
  }

  return envoyees
}

/**
 * Expédie un message et l'audite, en isolant l'échec.
 *
 * Un serveur SMTP injoignable ne doit pas interrompre la boucle : les tâches planifiées
 * parcourent tous les dossiers actifs, et une seule adresse en erreur priverait tous les
 * suivants de leur relance ou de leur escalade.
 *
 * L'audit n'est écrit qu'en cas de succès : consigner un envoi qui n'a pas eu lieu tromperait
 * l'auditeur sur ce que le système a réellement fait.
 */
async function expedier(
  dossier: { id: string; is_anonymous: boolean },
  evenementCode: string,
  adresse: string,
  objet: string,
  corps: string
): Promise<boolean> {
  try {
    await transportEmail().envoyer({ destinataire: adresse, objet, corps })
  } catch (erreur) {
    console.error(
      `Envoi e-mail en échec (évènement « ${evenementCode} », dossier ${dossier.id})`,
      erreur
    )
    return false
  }

  await auditerEnvoi(dossier, evenementCode, 'email', adresse, objet)
  return true
}

function adressesSupplementaires(gabarit: Gabarit): string[] {
  const valeur = gabarit.destinataires_email_supplementaires

  if (Array.isArray(valeur)) {
    return valeur.filter((v): v is string => typeof v === 'string')
  }

  return []
}

/** Ligne compatible avec le canal `database` de Laravel, pour rester lisible par les deux applications. */
async function creerNotificationOutil(
  utilisateurId: bigint,
  evenementCode: string,
  objet: string,
  corps: string
): Promise<void> {
  await prisma.notifications.create({
    data: {
      id: randomUUID(),
      type: TYPE_NOTIFICATION,
      notifiable_type: NOTIFIABLE_USER,
      notifiable_id: utilisateurId,
      data: JSON.stringify({ evenement_code: evenementCode, objet, corps }),
      created_at: new Date(),
      updated_at: new Date(),
    },
  })
}

/**
 * exigences-audit.md §2 : chaque notification envoyée est auditée (évènement, canal,
 * destinataire).
 *
 * §5 : le CONTENU n'est jamais enregistré pour un dossier anonyme — le journal ne doit pas
 * devenir une voie de réidentification du déclarant.
 */
async function auditerEnvoi(
  dossier: { id: string; is_anonymous: boolean },
  evenementCode: string,
  canal: string,
  destinataire: string,
  objet: string
): Promise<void> {
  await prisma.audit_logs.create({
    data: {
      user_id: null,
      action: 'notification.envoyee',
      auditable_type: String.raw`App\Models\Dossier`,
      auditable_id: dossier.id,
      new_values: {
        evenement_code: evenementCode,
        canal,
        destinataire,
        ...(dossier.is_anonymous ? {} : { objet }),
      },
      created_at: new Date(),
    },
  })
}

/** Notifications « outil » non lues d'un utilisateur. */
export async function notificationsNonLues(utilisateurId: bigint) {
  return prisma.notifications.findMany({
    where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: utilisateurId, read_at: null },
    orderBy: { created_at: 'desc' },
    take: 20,
    select: { id: true, data: true, created_at: true },
  })
}

export async function marquerNotificationsLues(utilisateurId: bigint): Promise<void> {
  await prisma.notifications.updateMany({
    where: { notifiable_type: NOTIFIABLE_USER, notifiable_id: utilisateurId, read_at: null },
    data: { read_at: new Date() },
  })
}
