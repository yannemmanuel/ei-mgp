#!/usr/bin/env node
/**
 * Exporte les données de RÉFÉRENCE vers `prisma/referentiels.json`.
 *
 * Ces données ne se déduisent d'aucun schéma : elles vivaient uniquement dans les seeders
 * Laravel. Après le retrait du framework, ceux-ci ne sont plus exécutables — sans cet export,
 * plus rien ne permettrait de recréer un environnement.
 *
 * N'exporte AUCUNE donnée métier ni personnelle : ni dossiers, ni identités, ni messages, ni
 * journal d'audit, ni comptes utilisateurs. Le fichier produit est versionnable.
 */
import { existsSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'

// ⚠️ SEULEMENT SI LE FICHIER EXISTE : `loadEnvFile` lève quand `.env` est absent, et il l’est
// dans tout conteneur de déploiement — les variables y sont injectées par la plate-forme.
// Raisonnement complet dans `prisma.config.ts`.
if (existsSync('.env')) process.loadEnvFile('.env')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/**
 * Ordre d'écriture, imposé par les clés étrangères : un parcours avant ses catégories, une
 * permission avant son association à un rôle.
 */
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
]

/** Les BigInt et les dates ne sont pas sérialisables en JSON. */
function serialisable(valeur) {
  if (typeof valeur === 'bigint') return { __type: 'bigint', valeur: String(valeur) }
  if (valeur instanceof Date) return { __type: 'date', valeur: valeur.toISOString() }

  return valeur
}

try {
  const contenu = {}

  for (const table of TABLES) {
    const lignes = await prisma[table].findMany()

    contenu[table] = lignes.map((ligne) =>
      Object.fromEntries(Object.entries(ligne).map(([cle, v]) => [cle, serialisable(v)]))
    )

    console.info(`  ${table.padEnd(24)} ${lignes.length} ligne(s)`)
  }

  await writeFile('prisma/referentiels.json', `${JSON.stringify(contenu, null, 2)}\n`, 'utf8')
  console.info('\nprisma/referentiels.json écrit.')
} finally {
  await prisma.$disconnect()
}
