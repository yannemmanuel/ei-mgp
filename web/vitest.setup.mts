// Les tests de parite interrogent la base reelle : DATABASE_URL doit etre chargee avant que
// `@/lib/prisma` ne soit importe. `process.loadEnvFile` est natif depuis Node 20.12.
process.loadEnvFile()

// Meme choix que le phpunit.xml de Laravel (BCRYPT_ROUNDS=4) : bcrypt au cout de production est
// volontairement lent, et les tests de creation hachent un code d'acces par declaration.
// N'affecte QUE les tests — la valeur par defaut du code reste 12.
process.env.BCRYPT_ROUNDS = '4'
