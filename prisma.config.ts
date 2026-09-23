import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

/*
  Prisma 7 ne charge plus automatiquement `.env` : on le fait ici.
  `process.loadEnvFile` est natif depuis Node 20.12 — inutile d'ajouter dotenv.

  ⚠️ SEULEMENT SI LE FICHIER EXISTE, ET C'EST TOUT L'ENJEU.

  `process.loadEnvFile()` LÈVE (`ENOENT`) quand `.env` est absent. Or `.env` n'est pas versionné
  — il porte un mot de passe — donc il n'existe dans AUCUN conteneur de déploiement : là-bas, les
  variables sont injectées dans le processus par la plate-forme.

  Ce fichier est chargé par toute commande `prisma`, et le déploiement en lance deux :
  `postinstall` puis la commande de build. Les deux échouaient, sur une erreur qui parle d'un
  fichier manquant — ce qui envoie chercher un fichier là où il ne doit surtout pas y en avoir.

  Un `.env` absent n'est donc PAS une erreur : c'est la situation normale en production. Ce qui
  serait une erreur, c'est l'absence de `DATABASE_URL` — et `env()` ci-dessous s'en charge, avec
  un message qui nomme la bonne variable.
*/
if (existsSync('.env')) process.loadEnvFile()

/**
 * Prisma 7 : l'URL de connexion ne vit plus dans `schema.prisma` (le champ `datasource.url`
 * y est refusé) mais ici.
 *
 * ⚠️ Cette configuration pointe vers la base RÉELLE. Seule `prisma db pull` (lecture seule) doit
 * être exécutée : jamais `migrate dev`, `migrate reset` ni `db push` — `migrate reset` propose
 * d'effacer, et cette base porte des déclarations réelles.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
