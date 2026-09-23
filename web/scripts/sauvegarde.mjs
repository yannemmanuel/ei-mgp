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
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/** Sauvegardes conservées localement. Au-delà, la rotation les supprime. */
const JOURS_RETENTION = 30

async function principal() {
  // ⚠️ SEULEMENT SI LE FICHIER EXISTE : `loadEnvFile` lève quand `.env` est absent, et il l’est
  // dans tout conteneur de déploiement — les variables y sont injectées par la plate-forme.
  // Raisonnement complet dans `prisma.config.ts`.
  if (existsSync('.env')) process.loadEnvFile('.env')

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

  const { connexion, schemas } = pourPgDump(url)

  // Format personnalisé (-Fc) : compressé, et restaurable table par table avec pg_restore.
  const code = await executer('pg_dump', [
    '--format=custom',
    '--no-owner',
    ...schemas,
    '--file',
    fichier,
    connexion,
  ])

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

/**
 * Paramètres de connexion compris par libpq — donc par `pg_dump`.
 *
 * Liste blanche et non liste noire : `DATABASE_URL` est écrite pour Prisma, dont les paramètres
 * propres (`schema`, `connection_limit`, `pgbouncer`, `sslaccept`…) font échouer libpq avec
 * « paramètre de la requête URI invalide ». Une liste noire laisserait passer le prochain
 * paramètre que Prisma inventera, et la sauvegarde échouerait de nouveau — au pire moment, celui
 * où l'on découvre qu'il n'y en a pas.
 */
const PARAMETRES_LIBPQ = new Set([
  'application_name',
  'channel_binding',
  'connect_timeout',
  'gssencmode',
  'options',
  'sslcert',
  'sslkey',
  'sslmode',
  'sslrootcert',
  'target_session_attrs',
])

/**
 * Traduit l'URL Prisma en une URL acceptée par `pg_dump`.
 *
 * `schema` n'est pas simplement retiré : il porte une intention — la sauvegarde doit couvrir le
 * schéma que l'application utilise. Il devient donc `--schema`, plutôt que d'être perdu.
 */
function pourPgDump(url) {
  const analysee = new URL(url)
  const schemas = []

  for (const [cle, valeur] of [...analysee.searchParams.entries()]) {
    if (cle === 'schema') {
      schemas.push(`--schema=${valeur}`)
      analysee.searchParams.delete(cle)
      continue
    }

    if (!PARAMETRES_LIBPQ.has(cle)) {
      analysee.searchParams.delete(cle)
    }
  }

  return { connexion: analysee.toString(), schemas }
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
