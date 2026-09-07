import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Session de SUIVI : l'authentification du déclarant, y compris anonyme.
 *
 * Équivalent de `session('suivi_verifie_'.$dossier->id)` côté Laravel, mais sans session
 * serveur : Next.js n'en a pas. Le jeton est donc un cookie signé, portant UNIQUEMENT
 * l'identifiant du dossier prouvé et une date d'expiration.
 *
 * Trois propriétés qui ne sont pas négociables :
 *
 * 1. Il ne référence AUCUN compte utilisateur. Un déclarant anonyme dialogue avec le Service MGP
 *    sans que son identité existe nulle part (RG-06) : y attacher un `user_id`, même
 *    « pratique », détruirait cette garantie.
 * 2. Il est signé, donc infalsifiable côté client : sans HMAC, remplacer l'identifiant dans le
 *    cookie donnerait accès à la messagerie de n'importe quel dossier sans en connaître le code.
 * 3. Il est court et unique : il ouvre UN dossier, celui dont la référence et le code viennent
 *    d'être prouvés — jamais « les dossiers de ce navigateur ».
 */

const COOKIE = 'suivi_session'
const DUREE_MS = 30 * 60 * 1000

function secret(): string {
  const valeur = process.env.AUTH_SECRET

  // Un secret absent produirait une signature constante et donc contrefaisable : mieux vaut
  // refuser d'ouvrir la session que d'en ouvrir une qui ne protège rien.
  if (!valeur) {
    throw new Error('AUTH_SECRET est requis pour signer la session de suivi.')
  }

  return valeur
}

function signer(charge: string): string {
  return createHmac('sha256', secret()).update(charge).digest('base64url')
}

function signatureValide(charge: string, signature: string): boolean {
  const attendue = Buffer.from(signer(charge))
  const fournie = Buffer.from(signature)

  // Longueurs différentes : `timingSafeEqual` lèverait. La comparaison de longueur ne fuit rien
  // d'exploitable, la signature ayant une taille fixe.
  if (attendue.length !== fournie.length) return false

  return timingSafeEqual(attendue, fournie)
}

/**
 * Fabrique du jeton, isolée des cookies pour être vérifiable en test : la propriété de sécurité
 * tient entièrement dans ce couple de fonctions, pas dans la façon dont le cookie est transporté.
 */
export function creerJetonSuivi(dossierId: string, expiration: number): string {
  const charge = `${dossierId}.${expiration}`
  return `${charge}.${signer(charge)}`
}

/** Identifiant du dossier si le jeton est authentique ET non expiré, `null` sinon. */
export function verifierJetonSuivi(jeton: string, maintenant: number = Date.now()): string | null {
  const separateur = jeton.lastIndexOf('.')
  if (separateur <= 0) return null

  const charge = jeton.slice(0, separateur)
  const signature = jeton.slice(separateur + 1)

  if (!signatureValide(charge, signature)) return null

  const [dossierId, expiration] = charge.split('.')
  if (!dossierId || !expiration) return null

  if (Number(expiration) <= maintenant) return null

  return dossierId
}

/** À appeler UNIQUEMENT après vérification effective de la référence et du code d'accès. */
export async function ouvrirSessionSuivi(dossierId: string): Promise<void> {
  const expiration = Date.now() + DUREE_MS

  const magasin = await cookies()
  magasin.set(COOKIE, creerJetonSuivi(dossierId, expiration), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(DUREE_MS / 1000),
  })
}

/** Identifiant du dossier prouvé, ou `null` si le cookie est absent, altéré ou expiré. */
export async function dossierDeLaSessionSuivi(): Promise<string | null> {
  const brut = (await cookies()).get(COOKIE)?.value

  return brut ? verifierJetonSuivi(brut) : null
}

export async function fermerSessionSuivi(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}
