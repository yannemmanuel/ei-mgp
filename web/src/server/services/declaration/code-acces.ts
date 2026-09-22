import { hacher, verifier } from '@/server/auth/hachage'

/**
 * RG-02 : code d'accès secondaire à 6 chiffres, remis au déclarant à la soumission. Avec la
 * référence, c'est la SEULE clé de consultation du dossier (RGI-12) — jamais l'e-mail ni le
 * téléphone, qui peuvent être absents.
 *
 * Le code n'est jamais stocké en clair : seul son haché bcrypt est persisté dans
 * `dossiers.access_code_hash`, au même format que les mots de passe — donc au même coût, et relu
 * par le même module.
 */
const LONGUEUR = 6

export function genererCodeAcces(): string {
  // `crypto.randomInt` est cryptographiquement sûr, contrairement à Math.random() : ce code
  // protège l'accès à un dossier de signalement, un générateur prédictible le rendrait
  // devinable.
  const max = 10 ** LONGUEUR
  const valeur = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % max

  return String(valeur).padStart(LONGUEUR, '0')
}

export function hacherCodeAcces(code: string): Promise<string> {
  return hacher(code)
}

export function verifierCodeAcces(code: string, hache: string): Promise<boolean> {
  return verifier(code, hache)
}
