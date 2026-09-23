import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/**
 * Applique les évolutions de schéma qui manquent à CETTE base, et enregistre ce qui est passé.
 *
 *     npm run db:evolutions              # dit ce qui manque, n'écrit rien
 *     npm run db:evolutions -- --appliquer
 *     npm run db:evolutions -- --adopter # enregistre l'existant SANS l'exécuter
 *
 * ⚠️ CE SCRIPT EXISTE PARCE QUE RIEN N'ENREGISTRAIT CE QUI ÉTAIT PASSÉ OÙ (constat O1 de l'audit
 * du 2026-09-22). Vingt-sept fichiers d'évolution, appliqués à la main, et pour savoir lesquels
 * une base donnée avait déjà reçus : la mémoire de celui qui les avait lancés.
 *
 * ⚠️ IL NE SERT PAS À CRÉER UNE BASE. Une base neuve part de `prisma/structure.sql`, qui décrit
 * la structure telle qu'elle est. Rejouer les évolutions depuis le vide ne produirait PAS le même
 * résultat — voir le refus ci-dessous, et la raison précise qui l'accompagne.
 */

const RACINE = path.resolve(import.meta.dirname, '..')
const DOSSIER = path.join(RACINE, 'prisma', 'evolutions')

type Evolution = { fichier: string; sql: string; empreinte: string }

function empreinteDe(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex')
}

/**
 * Les évolutions du dossier, triées par nom.
 *
 * ⚠️ LE TRI PAR NOM N'EST PAS L'ORDRE D'APPLICATION, et il ne faut pas s'y fier pour un rejeu
 * complet. `2026-09-21-alerte-circuit-par-type.sql` se trie AVANT
 * `2026-09-21-roles-entierement-parametrables.sql` — le tiret précède le « s » — alors qu'il
 * supprime une colonne que le second crée. Rejoués dans cet ordre depuis une base vide, ces deux
 * fichiers laissent `roles.alerte_circuit_critique` en place, ce qu'aucune production ne montre.
 *
 * Ce tri ne sert donc qu'à présenter les fichiers NOUVEAUX, ceux qu'une base n'a pas encore vus.
 * L'ordre RÉEL est celui de la colonne `rang`, écrit au moment où l'évolution passe.
 */
function lireEvolutions(): Evolution[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((fichier) => {
      const sql = readFileSync(path.join(DOSSIER, fichier), 'utf8')
      return { fichier, sql, empreinte: empreinteDe(sql) }
    })
}

/**
 * Exécute une évolution.
 *
 * ⚠️ INSTRUCTION PAR INSTRUCTION QUAND LE FICHIER N'A PAS DE TRANSACTION. `CREATE INDEX
 * CONCURRENTLY` ne peut pas s'exécuter dans un bloc transactionnel : PostgreSQL refuse l'ordre.
 * `2026-09-22-index-cles-etrangeres.sql` n'a donc ni BEGIN ni COMMIT, et l'envoyer d'un seul coup
 * place le serveur en transaction implicite — la première ligne échoue.
 *
 * Les fichiers qui portent leur propre BEGIN/COMMIT partent entiers : les découper romprait
 * l'atomicité qu'ils demandent explicitement.
 */
async function executer(prisma: PrismaClient, evolution: Evolution): Promise<void> {
  const transactionnel = /^\s*BEGIN\s*;/im.test(evolution.sql)

  if (transactionnel) {
    await prisma.$executeRawUnsafe(evolution.sql)
    return
  }

  const instructions = evolution.sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const instruction of instructions) {
    await prisma.$executeRawUnsafe(instruction)
  }
}

type Appliquee = { fichier: string; empreinte: string; rang: number }

async function dejaAppliquees(prisma: PrismaClient): Promise<Appliquee[] | null> {
  try {
    return await prisma.$queryRaw<Appliquee[]>`
      SELECT fichier, empreinte, rang FROM evolutions_appliquees ORDER BY rang`
  } catch {
    // La table n'existe pas : cette base n'a pas encore reçu l'évolution qui la crée.
    return null
  }
}

async function principal(): Promise<void> {
  // ⚠️ SEULEMENT SI LE FICHIER EXISTE : `loadEnvFile` lève quand `.env` est absent, et il l’est
  // dans tout conteneur de déploiement — les variables y sont injectées par la plate-forme.
  // Raisonnement complet dans `prisma.config.ts`.
  if (existsSync('.env')) process.loadEnvFile('.env')

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL absent.')

  const appliquer = process.argv.includes('--appliquer')
  const adopter = process.argv.includes('--adopter')

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

  try {
    const evolutions = lireEvolutions()
    const connues = await dejaAppliquees(prisma)

    /*
      ⚠️ REFUS SUR UNE BASE VIDE, ET C'EST UNE PROTECTION, PAS UNE LIMITATION.

      Rejouer les 27 évolutions depuis le vide ne reproduit PAS la base de production : l'ordre
      des noms diverge de l'ordre réel (voir `lireEvolutions()`), et le résultat porterait au
      moins une colonne de trop. Quelqu'un qui découvrirait ce script sur une base neuve
      l'emploierait naturellement ainsi, et obtiendrait une base subtilement fausse.
    */
    const tables = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`

    if (Number(tables[0]?.n ?? 0) === 0) {
      console.error(
        'Base VIDE. Ce script fait évoluer une base existante, il n’en crée pas.\n' +
          'Pour créer : jouer `prisma/structure.sql`, puis `npm run seed`, puis revenir ici avec\n' +
          '`--adopter` pour enregistrer les évolutions comme déjà présentes.'
      )
      process.exitCode = 1
      return
    }

    if (connues === null) {
      console.log(
        'La table `evolutions_appliquees` n’existe pas encore.\n' +
          'Appliquer d’abord `prisma/evolutions/2026-09-23-suivi-des-evolutions.sql`, puis relancer.'
      )
      process.exitCode = 1
      return
    }

    const parNom = new Map(connues.map((c) => [c.fichier, c]))

    /*
      ⚠️ UNE ÉVOLUTION DÉJÀ APPLIQUÉE QUI A CHANGÉ ARRÊTE TOUT.

      C'est la raison d'être de l'empreinte. Retoucher un fichier après son application produit
      une base qui ne correspond plus à son propre historique : le fichier décrit un état, la base
      en porte un autre, et rien ne les départage. Poursuivre reviendrait à propager l'écart.
    */
    const modifiees = evolutions.filter((e) => {
      const connue = parNom.get(e.fichier)
      return connue !== undefined && connue.empreinte !== e.empreinte
    })

    if (modifiees.length > 0) {
      console.error('⚠️ Ces évolutions ont été MODIFIÉES après avoir été appliquées :')
      for (const m of modifiees) console.error(`   ${m.fichier}`)
      console.error(
        '\nLa base ne correspond plus à son historique. Rien n’a été appliqué.\n' +
          'Rétablir le contenu d’origine, ou écrire une NOUVELLE évolution qui corrige l’écart.'
      )
      process.exitCode = 1
      return
    }

    const disparues = connues.filter((c) => !evolutions.some((e) => e.fichier === c.fichier))
    if (disparues.length > 0) {
      console.warn('⚠️ Appliquées à cette base mais absentes du dossier (renommées ? supprimées ?) :')
      for (const d of disparues) console.warn(`   ${d.fichier}`)
      console.warn('')
    }

    const manquantes = evolutions.filter((e) => !parNom.has(e.fichier))

    if (manquantes.length === 0) {
      console.log(`À jour — ${connues.length} évolution(s) enregistrée(s), aucune en attente.`)
      return
    }

    console.log(`${manquantes.length} évolution(s) en attente :`)
    for (const m of manquantes) console.log(`   ${m.fichier}`)

    if (!appliquer && !adopter) {
      console.log('\nRien n’a été fait. Relancer avec `-- --appliquer`, ou `-- --adopter`.')
      return
    }

    let rang = connues.reduce((max, c) => Math.max(max, c.rang), 0)

    for (const evolution of manquantes) {
      rang += 1

      if (adopter) {
        // ⚠️ ENREGISTRE SANS EXÉCUTER. Sert une seule fois, sur une base où les évolutions sont
        // déjà passées à la main : les rejouer serait au mieux inutile, au pire destructeur.
        console.log(`   adoptée  ${evolution.fichier}`)
      } else {
        await executer(prisma, evolution)
        console.log(`   appliquée ${evolution.fichier}`)
      }

      await prisma.$executeRaw`
        INSERT INTO evolutions_appliquees (fichier, empreinte, rang)
        VALUES (${evolution.fichier}, ${evolution.empreinte}, ${rang})`
    }

    console.log(
      `\n${manquantes.length} évolution(s) ${adopter ? 'adoptée(s)' : 'appliquée(s)'}.` +
        (adopter ? '' : ' Penser à `npm run db:pull` puis `npm run db:structure`.')
    )
  } finally {
    await prisma.$disconnect()
  }
}

await principal()
