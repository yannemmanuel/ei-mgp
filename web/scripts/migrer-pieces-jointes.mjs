#!/usr/bin/env node
/**
 * Transfère les pièces jointes du disque local vers le stockage objet, pour la bascule.
 *
 * Les pièces déposées avant la bascule vivent sur le disque de l'application Laravel. En
 * serverless ce disque n'existe pas : sans ce transfert, **toute pièce antérieure devient
 * illisible**, alors que sa ligne en base continue de la promettre.
 *
 * Le script est IDEMPOTENT et n'efface rien : il copie, met à jour `pieces_jointes.disque`, et
 * laisse les fichiers d'origine en place. En cas de doute, on peut le relancer, ou revenir en
 * arrière en remettant `disque = 'local'`.
 *
 * Usage (depuis `web/`, avec les variables d'environnement du site cible) :
 *   node scripts/migrer-pieces-jointes.mjs [--verifier]
 *
 * `--verifier` n'écrit rien : il liste ce qui serait transféré.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

process.loadEnvFile('.env')

const SIMULATION = process.argv.includes('--verifier')
const RACINE_LOCALE = process.env.STOCKAGE_RACINE ?? path.join(process.cwd(), 'storage', 'private')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/** Les chemins écrits par Laravel portent des antislashs, hérités du nom de classe PHP. */
const normaliser = (chemin) => chemin.split('\\').join('/')

async function principal() {
  const pieces = await prisma.pieces_jointes.findMany({
    where: { disque: 'local' },
    select: { id: true, chemin: true, nom_original: true, checksum_sha256: true },
  })

  if (pieces.length === 0) {
    console.info('Aucune pièce sur le disque local : rien à transférer.')
    return
  }

  console.info(
    `${pieces.length} pièce(s) à transférer${SIMULATION ? ' (simulation, aucune écriture)' : ''}.`
  )

  const { getStore } = SIMULATION ? { getStore: null } : await import('@netlify/blobs')
  const magasin = SIMULATION ? null : getStore({ name: 'pieces-jointes', consistency: 'strong' })

  let transferees = 0
  const echecs = []

  for (const piece of pieces) {
    const relatif = normaliser(piece.chemin)

    let octets
    try {
      octets = await readFile(path.join(RACINE_LOCALE, relatif))
    } catch {
      // Une ligne sans fichier est un problème à signaler, pas à masquer : le dossier promet une
      // pièce que personne ne pourra plus ouvrir.
      echecs.push(`${piece.nom_original} (${relatif}) — fichier introuvable`)
      continue
    }

    // Le checksum a été calculé au dépôt : s'il ne correspond plus, le fichier a été altéré et
    // le transférer propagerait la corruption.
    const empreinte = createHash('sha256').update(octets).digest('hex')

    if (piece.checksum_sha256 && empreinte !== piece.checksum_sha256) {
      echecs.push(`${piece.nom_original} (${relatif}) — empreinte SHA-256 différente`)
      continue
    }

    if (SIMULATION) {
      console.info(`  à transférer : ${relatif} (${Math.round(octets.byteLength / 1024)} Ko)`)
      transferees += 1
      continue
    }

    const tampon = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)
    await magasin.set(relatif, tampon)

    // Marqué APRÈS l'écriture : une interruption laisse la pièce lisible sur le disque local.
    await prisma.pieces_jointes.update({
      where: { id: piece.id },
      data: { disque: 'blobs' },
    })

    transferees += 1
    console.info(`  transférée : ${relatif}`)
  }

  console.info(`\n${transferees} pièce(s) traitée(s), ${echecs.length} en échec.`)

  for (const echec of echecs) {
    console.error(`  ÉCHEC — ${echec}`)
  }

  if (echecs.length > 0) {
    console.error(
      '\nCes pièces restent marquées « local » : leurs lignes existent, leurs fichiers non.'
    )
    process.exitCode = 1
  }
}

try {
  await principal()
} finally {
  await prisma.$disconnect()
}
