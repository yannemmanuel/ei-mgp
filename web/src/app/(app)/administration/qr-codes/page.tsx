import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { listerQrCodes, qrCodeDataUri } from '@/server/services/administration/qr-codes'
import { PanneauQrCodes } from './panneau'

export const metadata: Metadata = { title: 'Administration — QR codes' }
export const dynamic = 'force-dynamic'

export default async function PageQrCodes() {
  await exigerPermission('qrcodes.manage')

  const [codes, parcours] = await Promise.all([
    listerQrCodes(),
    prisma.parcours.findMany({ orderBy: { ordre: 'asc' }, select: { id: true, libelle: true } }),
  ])

  // Les SVG sont rendus côté serveur, en parallèle et mémorisés par jeton : un support donné
  // produit toujours la même image.
  const svgs = await Promise.all(codes.map((c) => qrCodeDataUri(c.token)))

  return (
    <PanneauQrCodes
      qrCodes={codes.map((c, index) => ({
        id: c.id,
        token: c.token,
        urlCible: c.url_cible,
        actif: c.actif,
        parcours: c.parcours.libelle,
        genereLe: c.genere_le.toISOString(),
        genererPar: c.users?.name ?? 'Système',
        svg: svgs[index],
      }))}
      parcours={parcours.map((p) => ({ id: String(p.id), libelle: p.libelle }))}
    />
  )
}
