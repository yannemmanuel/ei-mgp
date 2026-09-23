import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/**
 * Régénère `prisma/structure.sql` — la structure complète, telle qu'elle est.
 *
 * ⚠️ CE SCRIPT EXISTE PARCE QUE LE FICHIER QU'IL REMPLACE AVAIT POURRI SANS BRUIT.
 *
 * `schema-initial.sql` était présenté comme « Structure complète » et constituait le SEUL chemin
 * documenté pour recréer un environnement. Au 2026-09-23, il lui manquait **8 tables** —
 * `role_etapes`, `lieux`, `villes`, `postes`, `familles_risque`, `role_parcours`,
 * `invitations_connexion`, `utilisateur_parcours` — et **16 colonnes** ; il portait en prime
 * 7 tables supprimées depuis.
 *
 * Une base recréée à partir de lui n'aurait su ni autoriser un geste (pas de `role_etapes`), ni
 * recevoir une déclaration (pas de `lieux`). Le fichier disait le contraire.
 *
 * La cause n'est pas l'étourderie : c'était un fichier écrit UNE fois, complété À LA MAIN, que
 * rien n'obligeait à suivre les dix-huit évolutions venues après. D'où ce script — la fraîcheur
 * devient une commande qu'on relance, plus une discipline qu'on oublie.
 *
 *     npm run db:structure
 *
 * ⚠️ À RELANCER APRÈS CHAQUE ÉVOLUTION DE SCHÉMA, juste après `npm run db:pull`. Le contrôle
 * `structure-a-jour.test.ts` échoue si on l'oublie : c'est lui, et non cette consigne, qui tient
 * la promesse.
 */

const RACINE = path.resolve(import.meta.dirname, '..')
const CIBLE = path.join(RACINE, 'prisma', 'structure.sql')

/**
 * Le corps de la structure, produit par Prisma depuis `schema.prisma`.
 *
 * ⚠️ PAS `pg_dump`, ET C'EST DÉLIBÉRÉ. `pg_dump` 18 émet des méta-commandes `\restrict` que seul
 * `psql` comprend : le fichier cesserait d'être du SQL portable, alors qu'il doit pouvoir être
 * joué par n'importe quel client — y compris `$executeRawUnsafe`. Prisma, lui, produit du SQL
 * standard.
 *
 * ⚠️ `schema.prisma` fait foi PARCE QU'IL EST INTROSPECTÉ. `db:pull` le reconstruit depuis la
 * base réelle : il ne peut donc pas décrire autre chose qu'elle. Si ce n'était pas le cas, ce
 * script propagerait une fiction.
 */
function structureDepuisPrisma(): string {
  return execFileSync(
    'npx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'],
    { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\n')
    // Prisma préfixe sa sortie d'une ligne de configuration : elle n'est pas du SQL.
    .filter((l) => !l.startsWith('Loaded Prisma config'))
    .join('\n')
    .trim()
}

/**
 * Ce que Prisma NE MODÉLISE PAS, et qui doit donc être rattaché à la main.
 *
 * ⚠️ RELEVÉ SUR LA BASE, JAMAIS RECOPIÉ. La version précédente de ce fichier portait la
 * contrainte CHECK « complétée à la main » : elle a survécu, mais rien n'aurait signalé une
 * SECONDE contrainte ajoutée plus tard. Ici, tout ce qui existe est relu à chaque régénération.
 */
async function horsPrisma(prisma: PrismaClient): Promise<string> {
  const checks = await prisma.$queryRaw<{ tbl: string; nom: string; def: string }[]>`
    SELECT c.conrelid::regclass::text AS tbl, c.conname AS nom, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'c' AND c.connamespace = 'public'::regnamespace
      AND c.conname NOT LIKE '%\\_not\\_null'
    ORDER BY 1, 2`

  const commentaires = await prisma.$queryRaw<{ tbl: string; col: string; texte: string }[]>`
    SELECT c.relname AS tbl, a.attname AS col, d.description AS texte
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid
    WHERE c.relnamespace = 'public'::regnamespace AND d.objsubid > 0
    ORDER BY 1, 2`

  const lignes: string[] = []

  if (checks.length > 0) {
    lignes.push(
      '-- ---------------------------------------------------------------------------------',
      '-- Contraintes CHECK',
      '--',
      '-- ⚠️ PRISMA NE LES MODÉLISE PAS : sans cette section, une base recréée accepterait une',
      '-- gravité hors de l’échelle 1-4, et rien ne le dirait avant la première statistique fausse.',
      '-- ---------------------------------------------------------------------------------',
      ''
    )
    for (const c of checks) {
      lignes.push(`ALTER TABLE "${c.tbl}" ADD CONSTRAINT "${c.nom}" ${c.def};`)
    }
    lignes.push('')
  }

  if (commentaires.length > 0) {
    lignes.push(
      '-- ---------------------------------------------------------------------------------',
      '-- Commentaires de colonne',
      '--',
      '-- Posés par les évolutions successives, ils portent la RAISON de colonnes dont le nom ne',
      '-- suffit pas. Prisma ne les régénère pas ; les perdre reviendrait à recréer une base',
      '-- muette sur ses propres choix.',
      '-- ---------------------------------------------------------------------------------',
      ''
    )
    for (const c of commentaires) {
      // Les apostrophes sont doublées : un commentaire en français en contient presque toujours.
      lignes.push(
        `COMMENT ON COLUMN "${c.tbl}"."${c.col}" IS '${c.texte.split("'").join("''")}';`
      )
    }
    lignes.push('')
  }

  return lignes.join('\n')
}

const EN_TETE = `-- Structure complète de la base — RÉGÉNÉRÉE, jamais écrite à la main.
--
--     npm run db:structure
--
-- ⚠️ CE FICHIER REMPLACE \`schema-initial.sql\`, qui avait pourri sans bruit : présenté comme
-- « structure complète » et seul chemin documenté de recréation, il lui manquait 8 tables et
-- 16 colonnes au 2026-09-23. Une base recréée à partir de lui n'aurait su ni autoriser un geste,
-- ni recevoir une déclaration.
--
-- ⚠️ IL N'EST PAS « INITIAL » : il décrit la base TELLE QU'ELLE EST, pas son point de départ.
-- L'historique des changements vit dans \`prisma/evolutions/\`, et ces fichiers-là ne servent qu'à
-- faire évoluer une base EXISTANTE. Pour en créer une neuve, c'est ce fichier — et lui seul.
--
-- ⚠️ NE PAS LE MODIFIER À LA MAIN. Toute correction faite ici serait effacée à la régénération
-- suivante, sans avertissement. Ce qui manque se corrige en base, puis se récupère par
-- \`npm run db:pull\` suivi de \`npm run db:structure\`.
`

async function principal(): Promise<void> {
  // Même convention que `seed.mts` : natif depuis Node 20.12, sans dépendance.
  // ⚠️ SEULEMENT SI LE FICHIER EXISTE : `loadEnvFile` lève quand `.env` est absent, et il l’est
  // dans tout conteneur de déploiement — les variables y sont injectées par la plate-forme.
  // Raisonnement complet dans `prisma.config.ts`.
  if (existsSync('.env')) process.loadEnvFile('.env')

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL absent : impossible de relever ce que Prisma ne modélise pas.')

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

  try {
    const corps = structureDepuisPrisma()
    const reste = await horsPrisma(prisma)

    const contenu = [EN_TETE, '', corps, '', reste].join('\n').replace(/\n{3,}/g, '\n\n')

    writeFileSync(CIBLE, contenu, 'utf8')

    const tables = (corps.match(/CREATE TABLE/g) ?? []).length
    const commentaires = (reste.match(/COMMENT ON COLUMN/g) ?? []).length
    console.log(`structure.sql régénéré — ${tables} tables, ${commentaires} commentaires de colonne`)
  } finally {
    await prisma.$disconnect()
  }
}

await principal()
