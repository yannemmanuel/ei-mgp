import { formatApercu } from '@/lib/apercu-pieces-jointes'

/**
 * Construction de la réponse HTTP qui sert une pièce jointe.
 *
 * Isolé du gestionnaire de route parce que c'est ici que se joue une exigence de sécurité, et
 * qu'une exigence de sécurité doit être exécutable par un test — le gestionnaire, lui, exige une
 * session et la base.
 *
 * Deux modes, et un seul point de décision entre eux :
 *
 * - **téléchargement** (défaut) : `attachment`, comportement historique, inchangé ;
 * - **aperçu** : `inline`, pour que le tableau de bord affiche la pièce sans la télécharger.
 *
 * L'aperçu n'assouplit pas `docs/exigences-securite.md` §3, il en respecte l'intention par
 * d'autres moyens : le fichier passe toujours par la route qui revérifie la Policy, son type réel
 * a été vérifié sur ses octets d'en-tête au téléversement, `nosniff` interdit toute
 * réinterprétation, et l'en-tête `sandbox` place le document dans une **origine opaque** — il ne
 * peut donc atteindre ni le DOM, ni les cookies, ni le stockage de l'application.
 */

export type PieceServie = {
  readonly nom_original: string
  readonly mime_type: string
  readonly taille_octets: number | bigint
}

/**
 * Valeur de `Content-Security-Policy` selon le format.
 *
 * `sandbox` seul pour les médias inertes. Pour un PDF, `allow-scripts` est nécessaire : le lecteur
 * intégré de Chrome est une extension dont l'affichage — dimensionnement, barre d'outils — repose
 * sur ses propres scripts, que `sandbox` sans cette permission bloque, laissant un cadre vide
 * (issue Chromium 40328564). Ce que l'on tient malgré tout, et qui est l'essentiel, c'est
 * l'ORIGINE OPAQUE : `allow-same-origin` reste absent, donc le document — et le JavaScript qu'un
 * PDF peut embarquer — n'a aucun accès à l'application qui l'affiche.
 */
function politiqueIsolation(mimeType: string): string {
  return formatApercu(mimeType) === 'pdf' ? 'sandbox allow-scripts' : 'sandbox'
}

/**
 * `Content-Disposition` sûr, quel que soit le nom d'origine.
 *
 * Le nom vient de la personne qui a téléversé : il peut contenir des guillemets, des accents, un
 * retour à la ligne. Le paramètre `filename` ASCII garde les clients anciens, `filename*` (RFC
 * 5987) porte le nom réel — sans quoi « Constat de sécurité — août.pdf » arriverait mutilé, voire
 * ferait échouer la construction de la réponse, les en-têtes n'acceptant pas ces octets.
 */
function dispositionAvecNom(disposition: 'inline' | 'attachment', nom: string): string {
  const nettoye = nom.replace(/["\\\r\n]/g, '').trim() || 'piece-jointe'
  const replis = nettoye.replace(/[^\x20-\x7e]/g, '_')

  return `${disposition}; filename="${replis}"; filename*=UTF-8''${encodeURIComponent(nettoye)}`
}

export function reponsePieceJointe(
  octets: Buffer,
  piece: PieceServie,
  options: { readonly apercu: boolean }
): Response {
  // Un aperçu n'est servi que pour les formats affichables. Demander l'aperçu d'un type qui n'en
  // a pas ne le force pas : la réponse retombe sur le téléchargement.
  const enApercu = options.apercu && formatApercu(piece.mime_type) !== null

  const entetes: Record<string, string> = {
    'Content-Type': piece.mime_type,
    'Content-Disposition': dispositionAvecNom(
      enApercu ? 'inline' : 'attachment',
      piece.nom_original
    ),
    'Content-Length': String(piece.taille_octets),
    'Cache-Control': 'no-store, private',
    // Défense supplémentaire contre l'interprétation d'un type deviné par le navigateur.
    'X-Content-Type-Options': 'nosniff',
  }

  if (enApercu) {
    entetes['Content-Security-Policy'] = politiqueIsolation(piece.mime_type)
  }

  return new Response(new Uint8Array(octets), { headers: entetes })
}
