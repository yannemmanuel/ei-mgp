// Les tests de parité interrogent la base réelle : DATABASE_URL doit être chargée avant que
// `@/lib/prisma` ne soit importé. `process.loadEnvFile` est natif depuis Node 20.12.
process.loadEnvFile()
