import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'

/**
 * Garde-fous sur le SCHÉMA lui-même, vérifiés sur la base réelle.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QU'UN AUDIT A DÛ LES TROUVER À LA MAIN (2026-09-22). Trente et une
 * clés étrangères n'avaient aucun index, dont six sur `dossiers`. Rien dans le dispositif ne
 * pouvait le signaler : ni le typage, ni les tests, ni l'application — qui fonctionnait
 * parfaitement, simplement de plus en plus lentement à mesure que les tables grossissent.
 *
 * Ce sont des contrôles STRUCTURELS : ils ne portent pas sur ce que le code fait, mais sur ce que
 * la base permet. Un défaut de cette nature ne se manifeste qu'en production, sous volume, et
 * jamais sous forme d'erreur — seulement de lenteur, puis de verrous.
 */
afterAll(async () => {
  await prisma.$disconnect()
})

describe('⚠️ Toute clé étrangère est indexée', () => {
  it('⚠️ n’en laisse aucune nue — le constat D1 de l’audit', async () => {
    /*
      ⚠️ POSTGRESQL N'INDEXE PAS LES CLÉS ÉTRANGÈRES, contrairement à MySQL — d'où vient ce
      schéma. La migration a donc reproduit les contraintes sans leurs index, et rien ne l'a dit.

      Deux effets, et le second est le plus insidieux :

        1. Chaque jointure ou filtre sur ces colonnes devient un parcours séquentiel.
        2. Chaque SUPPRESSION d'une ligne parent balaie la table enfant en entier, verrou tenu,
           pour vérifier qu'aucune ligne ne la cite. Or l'application offre la suppression des
           comptes, statuts, catégories, sites, directions et rôles.

      ⚠️ `indkey[0]` : l'index doit commencer par la colonne. Un index composite qui la porte en
      deuxième position ne sert PAS à la vérification de clé étrangère — PostgreSQL ne peut s'en
      servir que par son préfixe.
    */
    const nues = await prisma.$queryRawUnsafe<{ tbl: string; col: string }[]>(`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.contype = 'f'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid AND i.indkey[0] = k.attnum
        )
      ORDER BY 1, 2`)

    expect(
      nues.map((n) => `${n.tbl}.${n.col}`),
      'ces clés étrangères n’ont pas d’index : jointures en parcours séquentiel, et suppressions du parent qui balaient la table enfant'
    ).toEqual([])
  })

  it('n’en laisse aucun index à l’état INVALIDE', async () => {
    /*
      ⚠️ UNE CONSTRUCTION `CONCURRENTLY` INTERROMPUE LAISSE UN INDEX INVALIDE : il occupe la
      place, ralentit les écritures, et n'est utilisé par AUCUNE requête. C'est le pire des deux
      mondes, et rien ne le signale — l'index apparaît normalement dans la liste.

      Le remède est de le supprimer puis de le reconstruire ; encore faut-il savoir qu'il existe.
    */
    const invalides = await prisma.$queryRawUnsafe<{ idx: string }[]>(`
      SELECT s.indexrelname AS idx
      FROM pg_stat_user_indexes s
      JOIN pg_index i ON i.indexrelid = s.indexrelid
      WHERE NOT i.indisvalid
      ORDER BY 1`)

    expect(
      invalides.map((i) => i.idx),
      'ces index sont invalides : construction interrompue, ils coûtent sans servir'
    ).toEqual([])
  })
})

describe('⚠️ Les états du workflow existent en base', () => {
  it('ne laisse aucun statut du circuit manquer', async () => {
    /*
      Le code cherche « recu » par son code à chaque dépôt : sans cette ligne, plus aucune
      déclaration ne peut être enregistrée, et le déclarant ne lit qu'un « merci de réessayer ».

      La suppression d'un statut est autorisée — décision métier — donc le contrôle est en AVAL.
      `santeAdministration()` le remonte à l'administrateur ; celui-ci le tient côté suite, pour
      qu'une base semée de travers ne laisse pas les autres cas prouver n'importe quoi.
    */
    const { STATUTS } = await import('@/server/services/dossier/statuts')

    const enBase = await prisma.statuts_dossier.findMany({ select: { code: true } })
    const codes = new Set(enBase.map((s) => s.code))

    expect(
      STATUTS.filter((code) => !codes.has(code)),
      'ces états du circuit sont absents de la base : les dossiers qui devraient les atteindre resteront bloqués'
    ).toEqual([])
  })
})
