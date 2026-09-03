import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

/**
 * EX-DEC-01 : point d'entrée par QR code. Port de `QrCodeRedirectController` (Laravel).
 *
 * Un QR code désactivé ou inconnu renvoie 404, jamais une redirection : un code retiré de la
 * circulation (affiche périmée, site fermé) ne doit plus permettre de déposer une déclaration.
 */
export async function GET(_requete: Request, contexte: RouteContext<'/q/[token]'>) {
  const { token } = await contexte.params

  const qrCode = await prisma.qr_codes.findFirst({
    where: { token, actif: true },
    select: { parcours: { select: { code: true } } },
  })

  if (!qrCode) {
    notFound()
  }

  redirect(`/declarer/${qrCode.parcours.code}`)
}
