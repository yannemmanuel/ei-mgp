import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

/**
 * EX-DEC-01 : point d'entrée par QR code.
 *
 * Depuis la décision de passer à un **support unique**, la redirection mène au choix du parcours
 * et non plus à un formulaire déterminé : c'est le déclarant qui oriente sa déclaration. Un seul
 * QR à imprimer, et plus aucun risque qu'une affiche envoie vers le mauvais parcours.
 *
 * `parcours_id` reste renseigné sur chaque support — la colonne est obligatoire en base — mais
 * ne sert plus qu'à documenter le contexte d'émission.
 *
 * Un QR code désactivé ou inconnu renvoie 404, jamais une redirection : un code retiré de la
 * circulation (affiche périmée, site fermé) ne doit plus permettre de déposer une déclaration.
 */
export async function GET(_requete: Request, contexte: RouteContext<'/q/[token]'>) {
  const { token } = await contexte.params

  const qrCode = await prisma.qr_codes.findFirst({
    where: { token, actif: true },
    select: { id: true },
  })

  if (!qrCode) {
    notFound()
  }

  redirect('/declarer')
}
