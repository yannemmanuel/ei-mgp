#!/usr/bin/env node
/**
 * Sauvegarde logique de la base (pg_dump), destinée à être planifiée quotidiennement.
 *
 * ⚠️ **Le fichier produit contient des données personnelles** — `declaration_identites`, les
 * messages, le journal d'audit. Il relève des mêmes obligations que la base elle-même : stockage
 * chiffré, accès restreint, purge à échéance (RG-11). Ne le déposez pas dans un artefact de CI
 * ni dans un espace partagé sans y avoir réfléchi.
 *
 * Ce script est un COMPLÉMENT à la rétention de Neon (restauration à un instant donné), pas son
 * remplaçant : il protège contre ce que Neon ne couvre pas — la perte du compte, une erreur de
 * facturation, une migration de fournisseur.
 *
 * Usage :
 *   node scripts/sauvegarde.mjs [dossier-de-destination]
 *
 * Nécessite `pg_dump` dans le PATH, à une version au moins égale à celle du serveur.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/** Sauvegardes conservées localement. Au-delà, la rotation les supprime. */
const JOURS_RETENTION = 30

async function principal() {
  process.loadEnvFile('.env')

  const url = process.env.DATABASE_URL

  if (!url) {
    console.error('DATABASE_URL est absente : impossible de sauvegarder.')
    process.exitCode = 1
    return
  }

  const destination = path.resolve(process.argv[2] ?? 'sauvegardes')
  await mkdir(destination, { recursive: true })

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fichier = path.join(destination, `ei-mgp-${horodatage}.dump`)

  // Format personnalisé (-Fc) : compressé, et restaurable table par table avec pg_restore.
  const code = await executer('pg_dump', ['--format=custom', '--no-owner', '--file', fichier, url])

  if (code !== 0) {
    console.error(`pg_dump a échoué (code ${code}). Aucune sauvegarde produite.`)
    process.exitCode = code ?? 1
    return
  }

  const taille = (await stat(fichier)).size

  // Un dump anormalement petit est le symptôme classique d'une sauvegarde vide qu'on croit
  // valide pendant des mois. Mieux vaut échouer bruyamment.
  if (taille < 10_000) {
    console.error(`Sauvegarde suspecte : ${fichier} ne fait que ${taille} octets.`)
    process.exitCode = 1
    return
  }

  console.info(`Sauvegarde écrite : ${fichier} (${Math.round(taille / 1024)} Ko)`)

  const supprimees = await rotation(destination)
  if (supprimees > 0) {
    console.info(`${supprimees} sauvegarde(s) de plus de ${JOURS_RETENTION} jours supprimée(s).`)
  }
}

function executer(commande, arguments_) {
  return new Promise((resoudre) => {
    const processus = spawn(commande, arguments_, { stdio: ['ignore', 'inherit', 'inherit'] })

    processus.on('error', (erreur) => {
      console.error(`Impossible de lancer ${commande} :`, erreur.message)
      resoudre(1)
    })

    processus.on('close', resoudre)
  })
}

async function rotation(destination) {
  const limite = Date.now() - JOURS_RETENTION * 24 * 60 * 60 * 1000
  let supprimees = 0

  for (const nom of await readdir(destination)) {
    if (!nom.startsWith('ei-mgp-') || !nom.endsWith('.dump')) continue

    const chemin = path.join(destination, nom)

    if ((await stat(chemin)).mtimeMs < limite) {
      await unlink(chemin)
      supprimees += 1
    }
  }

  return supprimees
}

await principal()
