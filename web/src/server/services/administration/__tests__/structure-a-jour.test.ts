import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'

/**
 * `prisma/structure.sql` décrit-il encore la base RÉELLE ?
 *
 * ⚠️ CE CONTRÔLE EXISTE PARCE QUE SON ABSENCE A COÛTÉ CHER, EN SILENCE. Le fichier qu'il
 * surveille s'appelait `schema-initial.sql`, était documenté comme « Structure complète » et
 * constituait le SEUL chemin pour recréer un environnement. Au 2026-09-23, il lui manquait :
 *
 *   - 8 TABLES — `role_etapes`, `lieux`, `villes`, `postes`, `familles_risque`, `role_parcours`,
 *     `invitations_connexion`, `utilisateur_parcours` ;
 *   - 16 COLONNES ;
 *   - et il portait 7 tables supprimées depuis.
 *
 * Une base recréée à partir de lui n'aurait su ni autoriser un geste — pas de `role_etapes` —,
 * ni recevoir une déclaration — pas de `lieux`. **Le fichier disait le contraire, et rien ne
 * contredisait le fichier.**
 *
 * Dix-huit évolutions étaient passées sans qu'aucune ne le mette à jour, parce que rien ne
 * l'exigeait. Une consigne écrite dans un README n'aurait rien changé : c'est exactement ce qui
 * existait déjà.
 *
 * ⚠️ CE CAS EST LE SEUL À TENIR CETTE PROMESSE. Il échoue dès qu'une évolution touche le schéma
 * sans que `npm run db:structure` suive — et le message dit quoi taper.
 */
const STRUCTURE = readFileSync(
  path.join(process.cwd(), 'prisma', 'structure.sql'),
  'utf8'
)

const RELANCER = 'Relancer `npm run db:pull` puis `npm run db:structure`.'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('⚠️ La structure de référence décrit la base réelle', () => {
  it('⚠️ ne laisse AUCUNE table de la base absente du fichier', async () => {
    const tables = await prisma.$queryRaw<{ nom: string }[]>`
      SELECT table_name AS nom FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY 1`

    const absentes = tables
      .map((t) => t.nom)
      .filter((nom) => !STRUCTURE.includes(`CREATE TABLE "${nom}"`))

    expect(
      absentes,
      `ces tables existent en base mais pas dans structure.sql : une base recréée ne les aurait pas. ${RELANCER}`
    ).toEqual([])
  })

  it('⚠️ ne décrit AUCUNE table que la base n’a plus', async () => {
    /*
      Le revers, et il compte autant : le fichier portait sept tables Laravel supprimées. Les
      recréer donnerait une base qui ne ressemble à aucune autre — et sur laquelle une évolution
      future pourrait s'appuyer par erreur.
    */
    const tables = await prisma.$queryRaw<{ nom: string }[]>`
      SELECT table_name AS nom FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`

    const enBase = new Set(tables.map((t) => t.nom))
    const enTrop = [...STRUCTURE.matchAll(/CREATE TABLE "([^"]+)"/g)]
      .map((m) => m[1])
      .filter((nom) => !enBase.has(nom))

    expect(
      enTrop,
      `ces tables sont décrites dans structure.sql mais n’existent plus. ${RELANCER}`
    ).toEqual([])
  })

  it('⚠️ ne laisse aucune COLONNE de la base absente du fichier', async () => {
    /*
      ⚠️ LA VÉRIFICATION PORTE SUR LE COUPLE table.colonne, pas sur le seul nom de colonne.

      Chercher « le nom apparaît quelque part dans le fichier » laisserait passer une colonne
      `ordre` ajoutée à une table qui n'en avait pas : le mot figure déjà ailleurs. C'est
      précisément le genre d'angle mort qui fait qu'un contrôle rassure sans protéger.
    */
    const colonnes = await prisma.$queryRaw<{ tbl: string; col: string }[]>`
      SELECT table_name AS tbl, column_name AS col FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY 1, 2`

    // Le corps de chaque CREATE TABLE, indexé par table.
    const corps = new Map<string, string>()
    for (const bloc of STRUCTURE.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
      corps.set(bloc[1], bloc[2])
    }

    const absentes = colonnes
      .filter((c) => !(corps.get(c.tbl) ?? '').includes(`"${c.col}"`))
      .map((c) => `${c.tbl}.${c.col}`)

    expect(
      absentes,
      `ces colonnes existent en base mais pas dans structure.sql. ${RELANCER}`
    ).toEqual([])
  })

  it('⚠️ conserve les contraintes CHECK, que Prisma ne modélise pas', async () => {
    /*
      Elles ne viennent pas de `schema.prisma` : le générateur les relève sur la base et les
      rattache. Sans cette section, une base recréée accepterait une gravité hors de l'échelle
      1-4, et rien ne le dirait avant la première statistique fausse.
    */
    const checks = await prisma.$queryRaw<{ nom: string }[]>`
      SELECT conname AS nom FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace
        AND conname NOT LIKE '%\\_not\\_null'`

    const absentes = checks.map((c) => c.nom).filter((nom) => !STRUCTURE.includes(nom))

    expect(absentes, `contraintes CHECK perdues. ${RELANCER}`).toEqual([])
    expect(checks.length, 'aucune contrainte CHECK : le cas ne prouverait rien').toBeGreaterThan(0)
  })
})
