import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'

/**
 * Messagerie sécurisée liée à un dossier (EX-NOT-07) — port de
 * `App\Livewire\Messagerie\MessagerieDossier`.
 *
 * Deux voies d'accès, jamais confondues :
 * - l'ACTEUR authentifié, autorisé par `MessagePolicy` (permission + cloisonnement parcours) ;
 * - le DÉCLARANT, y compris anonyme, authentifié par le jeton de session obtenu sur `/suivi`
 *   (référence + code d'accès) et JAMAIS par un compte utilisateur — c'est ce qui permet à un
 *   déclarant anonyme de dialoguer sans que son identité existe nulle part (RG-06).
 */

export const EXPEDITEURS = ['agent', 'declarant'] as const
export type Expediteur = (typeof EXPEDITEURS)[number]

const LONGUEUR_MIN = 2
const LONGUEUR_MAX = 2000

export async function messagesDuDossier(dossierId: string) {
  return prisma.messages.findMany({
    where: { dossier_id: dossierId },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      expediteur_type: true,
      corps: true,
      created_at: true,
      lu_le: true,
      users: { select: { name: true } },
    },
  })
}

/**
 * Envoie un message.
 *
 * RG-06 : côté déclarant, `expediteur_user_id` reste NULL même si un compte existe — relier un
 * message à une identité annulerait la garantie d'anonymat.
 */
export async function envoyerMessage(params: {
  dossierId: string
  expediteur: Expediteur
  corps: string
  /** Renseigné uniquement pour un agent : un déclarant n'a pas de compte dans ce contexte. */
  expediteurUserId?: bigint | null
}): Promise<string> {
  const corps = params.corps.trim()

  if (corps.length < LONGUEUR_MIN) {
    throw new ErreurWorkflow('Le message est trop court.')
  }

  if (corps.length > LONGUEUR_MAX) {
    throw new ErreurWorkflow(`Le message ne doit pas dépasser ${LONGUEUR_MAX} caractères.`)
  }

  const message = await prisma.messages.create({
    data: {
      id: ulid().toLowerCase(),
      dossier_id: params.dossierId,
      expediteur_type: params.expediteur,
      expediteur_user_id: params.expediteur === 'agent' ? (params.expediteurUserId ?? null) : null,
      corps,
      created_at: new Date(),
    },
    select: { id: true },
  })

  return message.id
}

/** Marque comme lus les messages de « l'autre partie » à l'ouverture du panneau. */
export async function marquerMessagesLus(dossierId: string, lecteur: Expediteur): Promise<void> {
  const autrePartie: Expediteur = lecteur === 'agent' ? 'declarant' : 'agent'

  await prisma.messages.updateMany({
    where: { dossier_id: dossierId, expediteur_type: autrePartie, lu_le: null },
    data: { lu_le: new Date() },
  })
}
