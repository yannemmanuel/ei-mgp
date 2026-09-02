'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn } from '@/server/auth'

export type EtatConnexion = { erreur?: string }

/**
 * Message unique et générique quel que soit le motif d'échec (compte inexistant, mot de passe
 * faux, compte désactivé) : distinguer les cas permettrait d'énumérer les comptes valides.
 */
const MESSAGE_ECHEC = 'Identifiants invalides.'
const MESSAGE_THROTTLE = 'Trop de tentatives de connexion. Merci de réessayer dans une minute.'

async function adresseIp(): Promise<string> {
  const entetes = await headers()

  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    entetes.get('x-real-ip') ??
    'inconnue'
  )
}

export async function seConnecter(
  _etatPrecedent: EtatConnexion,
  donnees: FormData
): Promise<EtatConnexion> {
  const email = String(donnees.get('email') ?? '')
  const motDePasse = String(donnees.get('password') ?? '')

  if (email === '' || motDePasse === '') {
    return { erreur: MESSAGE_ECHEC }
  }

  try {
    await signIn('credentials', {
      email,
      password: motDePasse,
      ip: await adresseIp(),
      redirect: false,
    })
  } catch (erreur) {
    if (erreur instanceof AuthError) {
      const cause = erreur.cause?.err?.message
      return { erreur: cause === 'TROP_DE_TENTATIVES' ? MESSAGE_THROTTLE : MESSAGE_ECHEC }
    }
    throw erreur
  }

  // `redirect()` lève : à garder hors du try/catch pour ne pas être confondu avec un échec.
  redirect('/dashboard')
}
