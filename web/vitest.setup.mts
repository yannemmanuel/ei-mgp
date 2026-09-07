// Les tests de parite interrogent la base reelle : DATABASE_URL doit etre chargee avant que
// `@/lib/prisma` ne soit importe. `process.loadEnvFile` est natif depuis Node 20.12.
process.loadEnvFile()

// Meme choix que le phpunit.xml de Laravel (BCRYPT_ROUNDS=4) : bcrypt au cout de production est
// volontairement lent, et les tests de creation hachent un code d'acces par declaration.
// N'affecte QUE les tests — la valeur par defaut du code reste 12.
process.env.BCRYPT_ROUNDS = '4'

// --- Nettoyage des traces laissees par les tests --------------------------------------------
//
// Depuis que `notification_templates` est peuplée, toute déclaration ou tout changement de
// statut effectué par un test émet de VRAIES notifications, dont des lignes dans la table
// `notifications` (canal « outil »). Ces lignes ne sont rattachées à aucun dossier : elles
// échappent donc à `nettoyerDossiers()` et s'accumuleraient dans la boîte de réception des
// comptes de développement.
//
// On relève les lignes préexistantes avant le fichier de test, et on supprime celles apparues
// pendant. `fileParallelism: false` garantit qu'aucun autre fichier n'écrit en parallèle.
import { afterAll, beforeAll } from 'vitest'

let notificationsPreexistantes: Set<string>
let dernierAuditAvant: bigint

// Import DYNAMIQUE : un `import` statique serait hissé au-dessus de `process.loadEnvFile()`
// ci-dessus, et `@/lib/prisma` refuserait de s'initialiser faute de DATABASE_URL.
const clientPrisma = async () => (await import('@/lib/prisma')).prisma

beforeAll(async () => {
  const prisma = await clientPrisma()

  const lignes = await prisma.notifications.findMany({ select: { id: true } })
  notificationsPreexistantes = new Set(lignes.map((n) => n.id))

  // `audit_logs` est append-only par conception (RG-04) et n'a pas de cle etrangere vers
  // `dossiers` : les lignes ecrites pour un dossier de test survivent a sa suppression et
  // designeraient des dossiers inexistants dans le journal d'audit. L'id etant un
  // auto-increment, un simple repere suffit a delimiter ce que la campagne a produit.
  const dernier = await prisma.audit_logs.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  })
  dernierAuditAvant = dernier?.id ?? 0n
})

afterAll(async () => {
  const prisma = await clientPrisma()
  const lignes = await prisma.notifications.findMany({ select: { id: true } })
  const apparues = lignes.map((n) => n.id).filter((id) => !notificationsPreexistantes.has(id))

  if (apparues.length > 0) {
    await prisma.notifications.deleteMany({ where: { id: { in: apparues } } })
  }

  // Ne supprime QUE ce qui est apparu apres le repere : le journal d'audit reel n'est jamais
  // touche. C'est la seule suppression d'audit autorisee, et elle ne vaut que dans les tests.
  await prisma.audit_logs.deleteMany({ where: { id: { gt: dernierAuditAvant } } })
})
