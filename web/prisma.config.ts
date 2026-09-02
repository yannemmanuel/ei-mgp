import { defineConfig, env } from 'prisma/config'

// Prisma 7 ne charge plus automatiquement le fichier .env : on le fait explicitement.
// `process.loadEnvFile` est natif depuis Node 20.12 — inutile d'ajouter dotenv.
process.loadEnvFile()

/**
 * Prisma 7 : l'URL de connexion ne vit plus dans `schema.prisma` (le champ `datasource.url`
 * y est refusé) mais ici.
 *
 * Cette configuration pointe vers la base RÉELLE, partagée avec l'application Laravel encore
 * en service pendant la migration. Seule `prisma db pull` (lecture seule) doit être exécutée :
 * jamais `migrate dev`, `migrate reset` ni `db push`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
