process.loadEnvFile('.env')
const { PrismaPg } = await import('@prisma/adapter-pg')
const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const BASE = 'http://127.0.0.1:3211'

const categorie = await prisma.categories.findFirstOrThrow({ where: { parcours: { code: 'ei_employe' }, actif: true }, select: { id: true } })
const gravite = await prisma.niveaux_gravite.findFirstOrThrow({ where: { actif: true, niveau: 1 }, select: { id: true } })

// Récupère l'action serveur et l'horodatage depuis la page rendue.
const page = await (await fetch(`${BASE}/declarer/ei_employe`)).text()
const horodatage = page.match(/([0-9]{10}\.[A-Za-z0-9_-]{20,})/)?.[1]
const actionId = page.match(/"\$ACTION_ID_([a-f0-9]{40,})"/)?.[1] ?? page.match(/ACTION_ID_([a-f0-9]+)/)?.[1]
console.log('horodatage obtenu :', horodatage?.slice(0, 22) + '…')
console.log('action serveur    :', actionId ? actionId.slice(0, 16) + '…' : 'introuvable')

const avant = await prisma.dossiers.count()

async function soumettre(valeurHorodatage, libelle) {
  const form = new FormData()
  form.set('parcours', 'ei_employe')
  form.set('anonymat', 'on')
  form.set('categorieId', String(categorie.id))
  form.set('niveauGraviteId', String(gravite.id))
  form.set('description', 'Vérification S2 : description factuelle suffisamment longue pour passer.')
  form.set('dateSurvenance', new Date().toISOString().slice(0, 10))
  form.set('horodatageAffichage', valeurHorodatage)
  form.set('piegeAraignee', '')

  const res = await fetch(`${BASE}/declarer/ei_employe`, {
    method: 'POST',
    headers: { 'Next-Action': actionId ?? '' },
    body: form,
  })
  const corps = await res.text()
  const refuse = /pas pu être vérifié|trop rapidement|resté ouvert trop longtemps/.test(corps)
  const motifs = ['n’a pas pu être vérifié', 'trop rapidement', 'resté ouvert trop longtemps']
  const motif = motifs.find((m) => corps.includes(m))
  console.log(`\n  ${libelle}`)
  console.log(`    HTTP ${res.status} | refus détecté : ${refuse}${motif ? ' | ' + motif.slice(0, 60) : ''}`)
  return refuse
}

console.log('\n=== 1. Horodatage FORGÉ (le contournement d’origine) ===')
await soumettre(String(Math.floor(Date.now() / 1000) - 10), 'valeur brute « maintenant − 10 », sans signature')

console.log('\n=== 2. Signature INVENTÉE ===')
await soumettre(`${Math.floor(Date.now() / 1000) - 10}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, 'signature bidon')

console.log('\n=== 3. Horodatage VALIDE mais soumission instantanée ===')
await soumettre(horodatage ?? '', 'jeton frais, envoyé sans attendre les 3 s')

console.log('\n--- dossiers créés pendant ces essais :', (await prisma.dossiers.count()) - avant, '(attendu : 0) ---')
await prisma.$disconnect()
