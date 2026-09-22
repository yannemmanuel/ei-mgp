import { randomInt } from 'node:crypto'
import QRCode from 'qrcode'
import { ulid } from 'ulid'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '../dossier/workflow'
import { MODELES, attributsCrees, difference, journaliser, sansChangement } from '../audit/journal'

/**
 * Console des QR codes (EX-DEC-01)
 *
 * Le QR encode `/q/{token}`, jamais l'URL du formulaire : c'est cette indirection qui permet de
 * désactiver un support déjà imprimé sans le remplacer.
 *
 * Depuis la décision de passer à un **support unique**, tous les codes mènent au même écran de
 * choix. `parcours_id` reste renseigné — la colonne est obligatoire en base — mais ne documente
 * plus que le contexte d'émission du support (où il a été posé, pour qui).
 *
 * ⚠️ `url_cible` n'est LU par rien : `/q/[token]` mène à l'écran de choix sans consulter la
 * colonne. Elle reste écrite à la génération pour documenter la destination, mais la modifier ne
 * réoriente aucun support — l'honorer ferait de cette colonne une redirection ouverte pilotée
 * depuis l'administration. Voir MIGRATION_PLAN.md, risque n° 17.
 */

type Acteur = { id: bigint }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const LONGUEUR_TOKEN = 24

/** Équivalent de `Str::random(24)` : alphanumérique, tiré d'une source cryptographique. */
function jeton(): string {
  let resultat = ''

  for (let i = 0; i < LONGUEUR_TOKEN; i += 1) {
    resultat += ALPHABET[randomInt(ALPHABET.length)]
  }

  return resultat
}

function baseUrl(): string {
  return (process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export async function listerQrCodes() {
  return prisma.qr_codes.findMany({
    orderBy: { genere_le: 'desc' },
    select: {
      id: true,
      token: true,
      url_cible: true,
      actif: true,
      genere_le: true,
      desactive_le: true,
      parcours: { select: { code: true, libelle: true } },
      users: { select: { name: true } },
    },
  })
}

export async function genererQrCode(acteur: Acteur, parcoursId: bigint): Promise<string> {
  // Vérifie l'existence du parcours de rattachement, sans plus s'en servir pour la destination.
  await prisma.parcours.findUniqueOrThrow({ where: { id: parcoursId }, select: { id: true } })

  const valeurs = {
    id: ulid().toLowerCase(),
    parcours_id: parcoursId,
    token: jeton(),
    // Destination réelle : l'écran de choix, identique pour tous les supports.
    url_cible: `${baseUrl()}/declarer`,
    actif: true,
    genere_par: acteur.id,
    genere_le: new Date(),
  }

  await prisma.qr_codes.create({
    data: { ...valeurs, created_at: new Date(), updated_at: new Date() },
  })

  await journaliser({
    action: 'qr_code.cree',
    acteurId: acteur.id,
    auditableType: MODELES.qrCode,
    auditableId: valeurs.id,
    nouvelles: attributsCrees(valeurs),
  })

  return valeurs.id
}

export async function modifierUrlCible(
  acteur: Acteur,
  qrCodeId: string,
  urlCible: string
): Promise<void> {
  let analysee: URL

  try {
    analysee = new URL(urlCible)
  } catch {
    throw new ErreurWorkflow('Merci d’indiquer une URL valide.')
  }

  if (!['http:', 'https:'].includes(analysee.protocol)) {
    throw new ErreurWorkflow('Seules les URL http et https sont acceptées.')
  }

  const avant = await prisma.qr_codes.findUniqueOrThrow({ where: { id: qrCodeId } })

  await prisma.qr_codes.update({
    where: { id: qrCodeId },
    data: { url_cible: urlCible, updated_at: new Date() },
  })

  const ecart = difference(
    { url_cible: avant.url_cible },
    { url_cible: urlCible }
  )

  if (!sansChangement(ecart)) {
    await journaliser({
      action: 'qr_code.modifie',
      acteurId: acteur.id,
      auditableType: MODELES.qrCode,
      auditableId: qrCodeId,
      anciennes: ecart.anciennes,
      nouvelles: ecart.nouvelles,
    })
  }
}

/**
 * Active ou désactive un support.
 *
 * Un QR désactivé renvoie 404 sur `/q/{token}` : une affiche périmée ne doit plus permettre de
 * déposer une déclaration.
 */
export async function basculerActifQrCode(acteur: Acteur, qrCodeId: string): Promise<boolean> {
  const avant = await prisma.qr_codes.findUniqueOrThrow({ where: { id: qrCodeId } })
  const actif = !avant.actif

  await prisma.qr_codes.update({
    where: { id: qrCodeId },
    data: {
      actif,
      desactive_le: actif ? null : new Date(),
      updated_at: new Date(),
    },
  })

  await journaliser({
    action: 'qr_code.modifie',
    acteurId: acteur.id,
    auditableType: MODELES.qrCode,
    auditableId: qrCodeId,
    anciennes: { actif: avant.actif },
    nouvelles: { actif },
  })

  return actif
}

/**
 * SVG du QR code, en data URI.
 *
 * Le contenu encodé est `/q/{token}`, constant pour un token donné : le résultat est donc
 * mémorisé en mémoire de processus. Sans cela, une page listant N supports relancerait N
 * générations à chaque affichage.
 */
const cacheSvg = new Map<string, string>()

export async function qrCodeDataUri(token: string): Promise<string> {
  const memorise = cacheSvg.get(token)
  if (memorise) return memorise

  const svg = await QRCode.toString(`${baseUrl()}/q/${token}`, {
    type: 'svg',
    margin: 4,
    width: 160,
    errorCorrectionLevel: 'M',
  })

  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  cacheSvg.set(token, dataUri)

  return dataUri
}
