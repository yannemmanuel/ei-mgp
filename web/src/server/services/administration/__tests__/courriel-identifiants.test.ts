import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  definirTransportEmail,
  reinitialiserTransportEmail,
  type MessageEmail,
} from '@/server/services/notification/transport'
import { CHEMIN_CONNEXION, envoyerIdentifiants } from '../courriel-identifiants'
import { VALIDITE_HEURES } from '../invitation'

/**
 * La remise de l'accès par e-mail.
 *
 * Ce qui est vérifié ici tient en une phrase : le message part avec le lien qu'il faut, et ce
 * lien ne fuit nulle part ailleurs.
 */
const JETON = 'jeton-de-test-3Kf9xQmZ0pLw7vNbCdEaRt'

class TransportEspion {
  readonly envoyes: MessageEmail[] = []

  async envoyer(message: MessageEmail): Promise<void> {
    this.envoyes.push(message)
  }
}

class TransportEnPanne {
  async envoyer(): Promise<void> {
    throw new Error('535 Authentication failed')
  }
}

let espion: TransportEspion
let plancherAudit: bigint

// ⚠️ Le SMTP n'est pas configuré sur la base de travail : sans ces variables, `envoyerIdentifiants`
// s'abstient délibérément et aucun cas ne prouverait rien. On les pose ici, et le transport reste
// remplacé par un espion — rien ne sort jamais de la machine.
const ENV_ORIGINE = { host: process.env.MAIL_HOST, from: process.env.MAIL_FROM }

beforeEach(() => {
  process.env.MAIL_HOST = 'smtp.test.invalid'
  process.env.MAIL_FROM = 'mgp@test.invalid'
  espion = new TransportEspion()
  definirTransportEmail(espion)
})

afterEach(() => {
  process.env.MAIL_HOST = ENV_ORIGINE.host
  process.env.MAIL_FROM = ENV_ORIGINE.from
  reinitialiserTransportEmail()
})

// Le plancher isole les lignes d'audit écrites ICI : jamais de suppression sur l'historique réel.
beforeEach(async () => {
  const derniere = await prisma.audit_logs.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  plancherAudit = derniere?.id ?? 0n
})

afterAll(async () => {
  await prisma.audit_logs.deleteMany({
    where: { id: { gt: plancherAudit }, action: 'user.identifiants_envoyes' },
  })
})

async function envoyer() {
  const acteur = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })

  return envoyerIdentifiants({
    utilisateurId: acteur.id,
    acteurId: acteur.id,
    nom: 'Awa Koffi',
    email: 'awa.koffi@example.test',
    jeton: JETON,
  })
}

describe('Le message porte de quoi se connecter', () => {
  it('porte l’identifiant et le lien d’invitation', async () => {
    const resultat = await envoyer()

    expect(resultat.etat).toBe('expedie')
    expect(espion.envoyes).toHaveLength(1)

    const message = espion.envoyes[0]
    expect(message.destinataire).toBe('awa.koffi@example.test')
    expect(message.corps).toContain('awa.koffi@example.test')
    expect(message.corps, 'le lien d’invitation manque').toContain(
      `/premiere-connexion/${JETON}`
    )
  })

  it('annonce la durée de validité et l’usage unique', async () => {
    // Un lien qui expire sans l'avoir dit se lit comme une panne. La personne doit savoir qu'elle
    // a trois jours, et qu'un second clic ne marchera pas.
    await envoyer()

    const corps = espion.envoyes[0].corps
    expect(corps).toContain(String(VALIDITE_HEURES))
    expect(corps).toMatch(/une fois/i)
  })

  it('⚠️ ne contient AUCUN mot de passe', async () => {
    /*
      Le ressort même du changement : le message ne porte plus de secret réutilisable. Un mot de
      passe envoyé par courriel y reste aussi longtemps que le message — boîte de réception,
      serveur relais, sauvegarde — et ouvre le compte à qui l'y retrouve des mois plus tard.
    */
    await envoyer()

    expect(espion.envoyes[0].corps.toLowerCase()).not.toContain('mot de passe provisoire')
  })

  it('⚠️ le chemin de connexion suit celui d’Auth.js', async () => {
    /*
      La constante est recopiée de `pages.signIn` plutôt qu'importée — ce module-là initialise
      NextAuth au chargement. La copie est donc confrontée ici à sa source, lue comme du texte.
      Un lien mort dans le seul message que reçoit un nouvel arrivant ne se rattrape pas.
    */
    const source = await import('node:fs/promises')
    const config = await source.readFile('src/server/auth/config.ts', 'utf8')

    expect(config, 'le chemin de connexion a changé sans que le courriel suive').toContain(
      `signIn: '${CHEMIN_CONNEXION}'`
    )
  })
})

describe('Le jeton ne fuit pas', () => {
  it('n’apparaît PAS dans la ligne d’audit', async () => {
    await envoyer()

    const ligne = await prisma.audit_logs.findFirstOrThrow({
      where: { action: 'user.identifiants_envoyes', id: { gt: plancherAudit } },
      orderBy: { id: 'desc' },
      select: { new_values: true, old_values: true },
    })

    const trace = JSON.stringify(ligne)

    expect(trace, 'le jeton est écrit dans le journal').not.toContain(JETON)
    // L'adresse, elle, doit y être : le journal répond à « qui a reçu de quoi se connecter ».
    expect(trace).toContain('awa.koffi@example.test')
  })

  it('⚠️ n’envoie RIEN quand le SMTP n’est pas configuré', async () => {
    /*
      Le cas le plus important du fichier.

      Sans configuration, `transportEmail()` replie sur `TransportJournal`, qui écrit le corps
      ENTIER sur la sortie standard — le lien d'invitation irait donc dans les traces du serveur,
      où il resterait valable trois jours pour quiconque y a accès. On s'abstient, et on le dit :
      l'appelant bascule alors sur un mot de passe remis en main propre.
    */
    delete process.env.MAIL_HOST
    delete process.env.MAIL_FROM

    const resultat = await envoyer()

    expect(resultat.etat).toBe('sans_transport')
    expect(espion.envoyes, 'un message est parti sans transport configuré').toHaveLength(0)
  })
})

describe('Une panne d’envoi ne défait pas la création', () => {
  it('rend l’échec au lieu de le lever', async () => {
    // Le compte est déjà écrit quand l'envoi a lieu. Une exception ferait croire à l'échec de la
    // création : l'administrateur recommencerait et se heurterait au doublon d'adresse.
    definirTransportEmail(new TransportEnPanne())

    const resultat = await envoyer()

    expect(resultat.etat).toBe('echec')
    if (resultat.etat === 'echec') {
      expect(resultat.raison).toContain('535')
    }
  })

  it('ne consigne aucun envoi quand il n’a pas eu lieu', async () => {
    definirTransportEmail(new TransportEnPanne())

    await envoyer()

    const lignes = await prisma.audit_logs.count({
      where: { action: 'user.identifiants_envoyes', id: { gt: plancherAudit } },
    })

    expect(lignes, 'le journal affirme un envoi qui a échoué').toBe(0)
  })
})
