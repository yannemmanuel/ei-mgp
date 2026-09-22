import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Horodatage d'affichage du formulaire public, SIGNÉ par le serveur.
 *
 * ⚠️ LE DÉFAUT QUE CE MODULE FERME — constat S2 de l'audit du 2026-09-22.
 *
 * Le délai minimal de remplissage (DT-14) se calculait sur une valeur posée par le NAVIGATEUR, au
 * montage du formulaire. Le code le disait franchement — « contrepartie assumée : un robot peut
 * forger cette valeur » — et s'appuyait sur les deux autres remparts, le champ piège et la
 * limitation de débit par IP, tous deux bien vérifiés côté serveur.
 *
 * Le compromis était lucide, mais il laissait le contrôle le plus visible du dispositif n'en être
 * pas un : un script poste `maintenant − 10` et franchit les trois secondes sans attendre. Avec
 * cinq soumissions autorisées par minute et par adresse, cela fait cinq déclarations instantanées
 * par minute — là où le délai, s'il mordait, imposerait de charger le formulaire puis d'attendre
 * avant chacune.
 *
 * ⚠️ CE QUI REND LA SIGNATURE POSSIBLE AUJOURD'HUI : la page est déjà en rendu dynamique
 * (`force-dynamic`), précisément parce que l'horodatage doit être frais. La raison invoquée à
 * l'époque pour le poser côté client — « calculer l'heure pendant le rendu le rendrait impur » —
 * ne tient plus : le rendu est déjà daté à chaque visite.
 *
 * ⚠️ CE QUE LA SIGNATURE NE FAIT PAS. Un robot peut toujours charger le formulaire pour obtenir
 * un horodatage frais. Ce n'est pas un échec : il doit alors faire une requête de PLUS et
 * attendre trois secondes avant chaque envoi, ce qui, croisé avec la limite par adresse, rend le
 * flot coûteux. Aucun de ces contrôles ne prétend arrêter un adversaire décidé ; ensemble, ils
 * écartent le robot opportuniste, qui est la menace réelle sur un formulaire public.
 */

/** Séparateur entre la valeur et sa signature. Absent du base64url, donc non ambigu. */
const SEPARATEUR = '.'

/**
 * Durée au-delà de laquelle un horodatage signé n'est plus accepté.
 *
 * ⚠️ SANS CETTE BORNE, LA SIGNATURE NE SERVIRAIT À RIEN. Un robot chargerait le formulaire UNE
 * fois, garderait le jeton obtenu et le rejouerait indéfiniment — la signature resterait valide,
 * et le délai minimal serait franchi dès la deuxième seconde.
 *
 * Douze heures : assez large pour un formulaire long, resté ouvert dans un onglet pendant une
 * matinée de travail. Le refus produit un message explicite, jamais un échec muet.
 */
const VALIDITE_SECONDES = 12 * 60 * 60

function secretDeSignature(): string {
  const secret = process.env.AUTH_SECRET

  /*
    ⚠️ ÉCHEC FERMÉ, jamais ouvert. Sans secret, on ne peut ni signer ni vérifier : accepter
    l'horodatage « faute de mieux » rétablirait exactement le défaut qu'on ferme, en silence et
    sur toutes les installations mal configurées.

    `AUTH_SECRET` est déjà exigé par Auth.js : une installation sans lui ne permet pas de se
    connecter. Aucune configuration valide ne peut donc tomber ici.
  */
  if (!secret) {
    throw new Error(
      "AUTH_SECRET est absente de l'environnement : impossible de signer l'horodatage du formulaire."
    )
  }

  return secret
}

function signature(secondes: number): string {
  return createHmac('sha256', secretDeSignature()).update(String(secondes)).digest('base64url')
}

/** L'horodatage à poser dans le formulaire, accompagné de sa signature. */
export function signerHorodatage(maintenant: number = Date.now()): string {
  const secondes = Math.floor(maintenant / 1000)

  return `${secondes}${SEPARATEUR}${signature(secondes)}`
}

export type VerificationHorodatage =
  | { readonly ok: true; readonly secondes: number }
  | { readonly ok: false; readonly raison: 'absent' | 'malforme' | 'signature' | 'expire' | 'futur' }

/**
 * Vérifie la signature et la fenêtre de validité — sans juger du délai de remplissage.
 *
 * ⚠️ LES DEUX QUESTIONS SONT SÉPARÉES À DESSEIN. « Cette valeur vient-elle de nous ? » et « le
 * formulaire a-t-il été rempli assez lentement ? » n'ont ni la même réponse ni le même message :
 * la première trahit une manipulation, la seconde un simple envoi trop rapide. Les confondre
 * donnerait au robot le même retour qu'à l'humain pressé, et à l'humain pressé un message qui
 * l'accuse.
 */
export function verifierHorodatage(
  valeur: string,
  maintenant: number = Date.now()
): VerificationHorodatage {
  if (valeur === '') return { ok: false, raison: 'absent' }

  const separateur = valeur.lastIndexOf(SEPARATEUR)
  if (separateur <= 0) return { ok: false, raison: 'malforme' }

  const brut = valeur.slice(0, separateur)
  const fournie = valeur.slice(separateur + 1)

  // `Number()` et non `parseInt` : « 12abc » doit être refusé, pas tronqué à 12.
  const secondes = Number(brut)
  if (!Number.isInteger(secondes) || secondes <= 0) return { ok: false, raison: 'malforme' }

  const attendue = signature(secondes)

  /*
    ⚠️ COMPARAISON À TEMPS CONSTANT, et longueurs comparées d'abord — `timingSafeEqual` lève si
    elles diffèrent. Le secret est le même que celui des sessions : une comparaison naïve
    laisserait le deviner octet par octet, ce qui donnerait bien plus qu'un contournement du
    délai de remplissage.
  */
  const a = Buffer.from(fournie)
  const b = Buffer.from(attendue)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, raison: 'signature' }
  }

  const secondesMaintenant = Math.floor(maintenant / 1000)

  /*
    ⚠️ UN HORODATAGE DANS LE FUTUR EST REFUSÉ. Il ne peut pas venir de nous — l'horloge du serveur
    est la seule source —, et l'accepter rendrait le délai minimal négatif, donc toujours
    satisfait. Une seconde de tolérance couvre l'arrondi entre la signature et la vérification.
  */
  if (secondes > secondesMaintenant + 1) return { ok: false, raison: 'futur' }

  if (secondesMaintenant - secondes > VALIDITE_SECONDES) return { ok: false, raison: 'expire' }

  return { ok: true, secondes }
}
