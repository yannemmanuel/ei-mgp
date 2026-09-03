'use server'

import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifierCodeAcces } from '@/server/services/declaration/code-acces'
import { autoriserTentative, cleThrottle, reinitialiserTentatives } from '@/server/auth/throttle'

/**
 * EX-NOT-06 : consultation publique d'un dossier par référence + code d'accès.
 *
 * RGI-12 : c'est la SEULE clé de consultation — jamais l'e-mail ni le téléphone, qui peuvent
 * être absents d'un dossier anonyme.
 *
 * Un code à 6 chiffres n'a qu'un million de combinaisons : le verrouillage ci-dessous est la
 * seule chose qui empêche de l'énumérer (docs/exigences-securite.md §4).
 */

export type EtatSuivi = {
  erreur?: string
  dossier?: {
    reference: string
    statutAffiche: string
    parcours: string
    deposeLe: string
    misAJourLe: string
  }
}

/** Message unique quel que soit le motif : ne jamais révéler si la référence existe. */
const MESSAGE_ECHEC = 'Aucun dossier ne correspond à ces informations.'
const MESSAGE_BLOQUE = 'Trop de tentatives. Merci de réessayer plus tard.'

async function adresseIp(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ?? entetes.get('x-real-ip') ?? 'inconnue'
  )
}

export async function rechercherDossier(
  _precedent: EtatSuivi,
  donnees: FormData
): Promise<EtatSuivi> {
  const reference = String(donnees.get('reference') ?? '').trim().toUpperCase()
  const codeAcces = String(donnees.get('codeAcces') ?? '').trim()

  if (reference === '' || codeAcces === '') {
    return { erreur: MESSAGE_ECHEC }
  }

  const cleIp = cleThrottle('suivi-ip', await adresseIp())
  // Verrou également sur la RÉFÉRENCE visée : sans lui, un attaquant distribué contournerait la
  // limite par IP en frappant une même référence depuis plusieurs adresses.
  const cleReference = cleThrottle('suivi-ref', reference)

  if (!autoriserTentative(cleIp) || !autoriserTentative(cleReference)) {
    return { erreur: MESSAGE_BLOQUE }
  }

  const dossier = await prisma.dossiers.findFirst({
    where: { reference },
    select: {
      id: true,
      reference: true,
      access_code_hash: true,
      created_at: true,
      updated_at: true,
      parcours: { select: { libelle: true } },
      // RGI-10 : le déclarant ne voit JAMAIS le statut interne, seulement sa projection
      // simplifiée. RGI-11 : un dossier « Rejeté » s'affiche comme « Clôturé ».
      statuts_dossier: { select: { libelle_affiche: true } },
    },
  })

  const codeValide =
    dossier?.access_code_hash != null && (await verifierCodeAcces(codeAcces, dossier.access_code_hash))

  if (!dossier || !codeValide) {
    // Journalisé pour l'auditeur/DPO (piste d'un éventuel brute-force). Seule la référence
    // tentée est enregistrée — jamais le code saisi, qui resterait exploitable en relisant le
    // journal.
    await prisma.audit_logs.create({
      data: {
        user_id: null,
        action: 'suivi.tentative_echouee',
        new_values: { reference_tentee: reference },
        ip_address: await adresseIp(),
        created_at: new Date(),
      },
    })

    return { erreur: MESSAGE_ECHEC }
  }

  reinitialiserTentatives(cleReference)

  return {
    dossier: {
      reference: dossier.reference,
      statutAffiche: dossier.statuts_dossier.libelle_affiche,
      parcours: dossier.parcours.libelle,
      deposeLe: (dossier.created_at ?? new Date()).toISOString(),
      misAJourLe: (dossier.updated_at ?? dossier.created_at ?? new Date()).toISOString(),
    },
  }
}
