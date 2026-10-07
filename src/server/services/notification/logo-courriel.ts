import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** Identifiant stable utilisé à la fois dans le HTML et dans la pièce MIME intégrée. */
export const CID_LOGO_SODECI = 'logo-sodeci@csst.dtdsodeci.ci'

let lectureLogo: Promise<Buffer> | null = null

/**
 * Charge une seule fois le logo qui sera joint au courriel.
 *
 * Une image distante est souvent masquée par Gmail ou Outlook. Une pièce `inline` référencée par
 * CID voyage avec le message et s'affiche sans requête vers l'application ni cookie de session.
 */
export function lireLogoSodeciCourriel(): Promise<Buffer> {
  lectureLogo ??= readFile(path.join(process.cwd(), 'public', 'logo-sodeci.png'))
  return lectureLogo
}
