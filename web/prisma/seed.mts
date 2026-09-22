/**
 * Rejoue les données de référence depuis `referentiels.json`.
 *
 * Recrée le paramétrage livré dans une base vierge. Sans ce
 * script, plus rien ne permettrait de recréer un environnement : ni les parcours, ni les
 * catégories, ni les délais, ni les permissions — et un déploiement sur une base neuve
 * démarrerait sur une application vide dont aucun formulaire ne fonctionnerait.
 *
 * **Idempotent** : chaque ligne est écrite par `upsert` sur sa clé primaire. Rejouer le script
 * ne duplique rien et n'efface rien.
 *
 * ⚠️ Ne contient AUCUNE donnée métier ni personnelle. Les comptes utilisateurs n'en font pas
 * partie : ils se créent depuis `/administration/utilisateurs`.
 *
 * Usage :
 *   npm run seed
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

process.loadEnvFile('.env')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/** Ordre imposé par les clés étrangères : un parcours avant ses catégories. */
const TABLES = [
  'parcours',
  'categories',
  'statuts_dossier',
  'niveaux_gravite',
  'canaux_captage',
  'sites',
  'directions',
  'sla_delais',
  'notification_templates',
  'permissions',
  'roles',
  'role_has_permissions',
] as const

/** Tables dont la clé primaire est composite (tables de liaison). */
const CLES_COMPOSEES: Partial<Record<(typeof TABLES)[number], string[]>> = {
  role_has_permissions: ['permission_id', 'role_id'],
}

type Encodee = { __type: 'bigint' | 'date'; valeur: string }

function decoder(valeur: unknown): unknown {
  if (valeur !== null && typeof valeur === 'object' && '__type' in valeur) {
    const encodee = valeur as Encodee
    return encodee.__type === 'bigint' ? BigInt(encodee.valeur) : new Date(encodee.valeur)
  }

  return valeur
}

async function principal(): Promise<void> {
  const chemin = path.join(process.cwd(), 'prisma', 'referentiels.json')
  const contenu = JSON.parse(await readFile(chemin, 'utf8')) as Record<
    string,
    Record<string, unknown>[]
  >

  for (const table of TABLES) {
    const lignes = contenu[table] ?? []
    const composee = CLES_COMPOSEES[table]

    for (const brute of lignes) {
      const ligne = Object.fromEntries(
        Object.entries(brute).map(([cle, valeur]) => [cle, decoder(valeur)])
      )

      const where = composee
        ? { [composee.join('_')]: Object.fromEntries(composee.map((c) => [c, ligne[c]])) }
        : { id: ligne.id }

      // `upsert` et non `create` : le script doit pouvoir être rejoué sur une base déjà peuplée
      // sans rien casser — c'est ce qui en fait un outil d'exploitation et pas seulement
      // d'installation.
      await (prisma[table] as { upsert: (a: unknown) => Promise<unknown> }).upsert({
        where,
        create: ligne,
        update: ligne,
      })
    }

    console.info(`  ${table.padEnd(24)} ${lignes.length} ligne(s)`)
  }
}

try {
  await principal()
  console.info('\nRéférentiels en place.')
} finally {
  await prisma.$disconnect()
}
