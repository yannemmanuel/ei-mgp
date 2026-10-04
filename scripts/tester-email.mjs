#!/usr/bin/env node
/**
 * Vérifie la configuration SMTP, et envoie un message d'essai.
 *
 * Sans cet outil, la seule façon de savoir si la messagerie fonctionne était de créer un compte
 * réel et d'attendre de voir si quelque chose arrivait — en laissant derrière soi un compte à
 * supprimer, et sans jamais savoir POURQUOI rien n'arrivait. Une authentification refusée, un port
 * filtré et une adresse d'expédition rejetée produisent le même silence côté application.
 *
 * Ici, chaque échec est nommé et assorti de ce qu'il faut corriger.
 *
 * Usage :
 *   npm run tester-email                      (vérifie la configuration, n'envoie rien)
 *   npm run tester-email -- vous@exemple.com  (vérifie, puis envoie un message d'essai)
 *
 * ⚠️ N'ÉCRIT RIEN : ni compte, ni invitation, ni ligne d'audit. Il ne touche pas à la base.
 */
import { existsSync } from 'node:fs'
import process from 'node:process'
import { createTransport } from 'nodemailer'

// ⚠️ SEULEMENT SI LE FICHIER EXISTE : `loadEnvFile` lève quand `.env` est absent, et il l’est
// dans tout conteneur de déploiement — les variables y sont injectées par la plate-forme.
// Raisonnement complet dans `prisma.config.ts`.
if (existsSync('.env')) process.loadEnvFile('.env')

const VARIABLES = [
  'RESEND_API_KEY',
  'RESEND_FROM',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_SECURE',
  'MAIL_USER',
  'MAIL_PASSWORD',
  'MAIL_FROM',
]

function valeur(nom) {
  const brut = process.env[nom]
  return brut === undefined || brut.trim() === '' ? null : brut.trim()
}

/** Le mot de passe n'est JAMAIS affiché : seule sa présence et sa longueur le sont. */
function afficher(nom) {
  const v = valeur(nom)

  if (v === null) return '(vide)'
  if (nom === 'MAIL_PASSWORD' || nom === 'RESEND_API_KEY') {
    return `(défini, ${v.length} caractères)`
  }

  return v
}

console.log('\nConfiguration lue dans .env\n')
for (const nom of VARIABLES) {
  console.log(`    ${nom.padEnd(15)} ${afficher(nom)}`)
}

const resendConfigure = valeur('RESEND_API_KEY') !== null && valeur('RESEND_FROM') !== null
const smtpConfigure = valeur('MAIL_HOST') !== null && valeur('MAIL_FROM') !== null

if (!resendConfigure && !smtpConfigure) {
  console.error(
    '\n✗ Aucun transport complet : configurez RESEND_API_KEY et RESEND_FROM' +
      ' (recommandé), ou MAIL_HOST et MAIL_FROM.' +
      "\n  Tant que c'est le cas, l'application JOURNALISE les messages au lieu de les expédier :" +
      "\n  aucun courriel ne part, et aucune erreur ne s'affiche.\n"
  )
  process.exit(1)
}

const config = resendConfigure
  ? {
      fournisseur: 'Resend',
      hote: 'smtp.resend.com',
      port: 465,
      securise: true,
      utilisateur: 'resend',
      motDePasse: valeur('RESEND_API_KEY'),
      expediteur: valeur('RESEND_FROM'),
    }
  : {
      fournisseur: 'SMTP générique',
      hote: valeur('MAIL_HOST'),
      port: Number(valeur('MAIL_PORT') ?? 587),
      securise: valeur('MAIL_SECURE') === 'true' || Number(valeur('MAIL_PORT') ?? 587) === 465,
      utilisateur: valeur('MAIL_USER'),
      motDePasse: valeur('MAIL_PASSWORD'),
      expediteur: valeur('MAIL_FROM'),
    }

if (config.utilisateur && !config.motDePasse) {
  console.warn(
    '\n⚠️  MAIL_USER est défini mais MAIL_PASSWORD est vide : la connexion partira SANS' +
      "\n   authentification. La plupart des serveurs la refuseront.\n"
  )
}

const transporteur = createTransport({
  host: config.hote,
  port: config.port,
  secure: config.securise,
  auth:
    config.utilisateur && config.motDePasse
      ? { user: config.utilisateur, pass: config.motDePasse }
      : undefined,
  // Mêmes verrous que le transport de l'application (avis GHSA-p6gq-j5cr-w38f).
  disableFileAccess: true,
  disableUrlAccess: true,
  // Court : un port filtré doit se manifester en secondes, pas au bout de deux minutes.
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
})

/**
 * Traduit l'échec en cause probable et en geste correctif.
 *
 * Les codes de nodemailer et les réponses SMTP sont exacts mais opaques : « EAUTH 535 » ne dit pas
 * qu'un compte Gmail exige un mot de passe d'application. C'est ce chaînon-là qui manque toujours.
 */
function expliquer(erreur) {
  const code = erreur.code ?? ''
  const reponse = String(erreur.response ?? erreur.message ?? '')

  if (code === 'EAUTH' || /5\.7\.\d|535|534/.test(reponse)) {
    return [
      'Le serveur a REFUSÉ les identifiants.',
      '  · Gmail / Google Workspace : un mot de passe de compte ne fonctionne pas. Il faut',
      '    activer la validation en deux étapes puis créer un « mot de passe d’application »',
      '    (16 caractères) et le mettre dans MAIL_PASSWORD.',
      '  · Microsoft 365 : l’authentification SMTP est désactivée par défaut sur le locataire ;',
      '    un administrateur doit l’activer pour la boîte utilisée.',
      '  · Vérifiez que MAIL_USER est bien l’adresse complète, et non le seul identifiant.',
    ]
  }

  if (code === 'ECONNREFUSED') {
    return [
      `Rien n’écoute sur ${config.hote}:${config.port}.`,
      '  · Vérifiez le port : 587 (STARTTLS, le plus courant) ou 465 (TLS implicite).',
      '  · Sur 465, MAIL_SECURE doit valoir "true".',
    ]
  }

  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS' || code === 'ENOTFOUND') {
    return [
      'Impossible d’atteindre le serveur.',
      '  · Nom d’hôte mal orthographié, ou port bloqué par un pare-feu ou le fournisseur d’accès.',
      '  · Beaucoup de réseaux d’entreprise filtrent le port 25 en sortie : préférez 587.',
    ]
  }

  if (/5\.7\.1|relay|not permitted|sender/i.test(reponse)) {
    return [
      'Le serveur a refusé l’ADRESSE D’EXPÉDITION.',
      '  · MAIL_FROM doit être une adresse que ce serveur a le droit d’utiliser — souvent la',
      '    même que MAIL_USER, ou un alias explicitement autorisé.',
    ]
  }

  return ['Cause non reconnue. La réponse brute du serveur figure ci-dessus.']
}

console.log(
  `\nConnexion ${config.fournisseur} à ${config.hote}:${config.port}` +
    ` (TLS ${config.securise ? 'implicite' : 'STARTTLS'})…`
)

try {
  await transporteur.verify()
  console.log('✓ Connexion et authentification acceptées.')
} catch (erreur) {
  console.error(`\n✗ Échec : ${erreur.message}`)
  if (erreur.response) console.error(`  Réponse du serveur : ${String(erreur.response).trim()}`)
  console.error('')
  for (const ligne of expliquer(erreur)) console.error(`  ${ligne}`)
  console.error('')
  process.exit(1)
}

const destinataire = process.argv[2]

if (!destinataire) {
  console.log(
    '\n✓ La configuration est bonne. L’application expédiera ses messages.' +
      '\n\n  Pour envoyer un message d’essai :' +
      '\n    npm run tester-email -- vous@exemple.com\n'
  )
  process.exit(0)
}

try {
  const info = await transporteur.sendMail({
    from: config.expediteur,
    to: destinataire,
    subject: 'Essai — plateforme EI / MGP',
    text: [
      'Ceci est un message d’essai.',
      '',
      'Si vous le lisez, la messagerie de la plateforme fonctionne : les liens de première',
      'connexion, les relances d’échéance et les alertes du circuit critique partiront.',
      '',
      `Expéditeur configuré : ${config.expediteur}`,
      `Serveur : ${config.hote}:${config.port}`,
    ].join('\n'),
  })

  console.log(`\n✓ Message accepté par le serveur pour ${destinataire}.`)
  console.log(`  Identifiant du message : ${info.messageId}`)

  if (info.rejected?.length) {
    console.warn(`  ⚠️  Destinataires refusés : ${info.rejected.join(', ')}`)
  }

  console.log(
    '\n  ⚠️ « Accepté » ne veut pas dire « reçu ». Le message peut encore être rejeté plus loin' +
      '\n     ou classé indésirable. Vérifiez la boîte de réception, et le dossier « spam ».\n'
  )
} catch (erreur) {
  console.error(`\n✗ L’envoi a échoué : ${erreur.message}`)
  if (erreur.response) console.error(`  Réponse du serveur : ${String(erreur.response).trim()}`)
  console.error('')
  for (const ligne of expliquer(erreur)) console.error(`  ${ligne}`)
  console.error('')
  process.exit(1)
}
