import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/**
 * Client Prisma unique, partagé par tout le code serveur.
 *
 * Prisma 7 impose un « driver adapter » explicite : passer seulement une URL de connexion au
 * constructeur ne fonctionne plus. L'URL vit dans DATABASE_URL (cf. prisma.config.ts pour les
 * commandes CLI).
 *
 * En développement, Next.js réévalue les modules à chaque modification : sans ce cache sur
 * `globalThis`, chaque rechargement ouvrirait un pool de connexions supplémentaire et finirait
 * par saturer PostgreSQL. En production le module n'est évalué qu'une fois, le cache est inutile.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function creerClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL est absente de l'environnement : impossible d'initialiser Prisma."
    )
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? creerClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
