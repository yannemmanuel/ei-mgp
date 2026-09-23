import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { santeAdministration } from '../sante-administration'
import { MODELES } from '@/server/modeles'

/**
 * Ce que l'administrateur doit voir — et ce qu'il ne doit pas voir.
 *
 * Son tableau de bord ne parlait que de dossiers, alors que DT-02 lui en refuse délibérément
 * l'accès : il lisait chaque matin « ceux qui vous seront confiés apparaîtront ici », une
 * promesse que son propre rôle interdit de tenir.
 *
 * Ces cas portent sur ce que les contrôles RAPPORTENT, confronté à la base. Un contrôle qui
 * annoncerait un problème inexistant ferait perdre du temps ; un contrôle qui en tairait un
 * laisserait, lui, le dispositif silencieusement inopérant — c'est le pire des deux.
 */
afterAll(async () => {
  await prisma.$disconnect()
})

const MODEL_TYPE_USER = MODELES.utilisateur

describe('Ce qui remonte correspond à la base', () => {
  it('ne rapporte jamais une alerte à zéro', async () => {
    // Une ligne qui annonce zéro tous les jours cesse d'être lue, et fait passer pour vide un
    // écran qui ne l'est pas.
    for (const alerte of await santeAdministration()) {
      expect(alerte.valeur, alerte.cle).toBeGreaterThan(0)
    }
  })

  it('compte exactement les délais non validés', async () => {
    const attendu = await prisma.sla_delais.count({ where: { est_valide_metier: false } })
    const alerte = (await santeAdministration()).find((a) => a.cle === 'delais')

    expect(alerte?.valeur ?? 0).toBe(attendu)
  })

  it('⚠️ repère un compte dont le poste ne figure PAS au référentiel', async () => {
    /*
      ⚠️ LE SEUL LIEN QUE LE SCHÉMA NE PEUT PAS TENIR. `users.poste` porte un LIBELLÉ, pas une
      clé : rien n'empêche qu'il désigne un poste disparu du référentiel. Le défaut existe déjà
      en base — « CS Achat », porté par un compte réel —, et n'apparaissait nulle part : ni dans
      la console des comptes, qui affiche le libellé sans le vérifier, ni dans celle des postes,
      qui ne connaît que les siens.

      ⚠️ CE CAS POSE SON ÉTAT plutôt que de compter sur l'orphelin existant : celui-ci peut être
      corrigé demain par un administrateur, et le cas passerait alors au vert en ayant cessé de
      vérifier quoi que ce soit.
    */
    const avant = (await santeAdministration()).find((a) => a.cle === 'postes-orphelins')

    const compte = await prisma.users.create({
      data: {
        name: 'Compte de test — poste orphelin',
        email: `test-poste-orphelin-${Date.now()}@example.test`,
        password: 'x'.repeat(60),
        poste: 'Poste qui n’existe dans aucun référentiel',
        actif: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })

    try {
      const apres = (await santeAdministration()).find((a) => a.cle === 'postes-orphelins')

      expect(apres, 'l’alerte n’est pas remontée').toBeDefined()
      expect(apres?.valeur, 'le compte orphelin n’a pas été compté').toBe(
        (avant?.valeur ?? 0) + 1
      )
      // Ce n'est pas un blocage : le dispositif fonctionne, c'est le référentiel qui est incomplet.
      expect(apres?.bloquant).toBe(false)
    } finally {
      // Dans un `finally` : une assertion en échec ne doit pas laisser un compte d'essai en base,
      // où il ferait échouer l'exécution suivante en gonflant le décompte.
      await prisma.users.delete({ where: { id: compte.id } })
    }
  })

  it('ne compte une direction sans site que si PERSONNE n’y est habilité', async () => {
    /*
      ⚠️ CE CAS A CHANGÉ DE SENS, et c'est voulu.

      L'alerte comptait toutes les directions sans site, en affirmant que leurs déclarations
      n'atteignaient personne. Depuis qu'on peut habiliter un compte directement sur une direction,
      c'est faux : une direction sans site achemine ses déclarations à son titulaire. Le cas
      observé en production est exactement celui-là.

      Maintenue, l'alerte signalait comme bloquant un paramétrage correct — et une alerte fausse
      finit par faire ignorer les vraies.
    */
    const attendu = await prisma.directions.count({
      where: { actif: true, site_id: null, users: { none: { actif: true } } },
    })
    const alerte = (await santeAdministration()).find((a) => a.cle === 'directions')

    expect(alerte?.valeur ?? 0).toBe(attendu)
  })

  it('⚠️ ne signale PAS une direction sans site dont quelqu’un répond', async () => {
    /*
      ⚠️ LA SITUATION EST POSÉE ICI, plus cherchée en base — depuis le 2026-09-21.

      Le cas prenait la première direction sans site ayant un compte actif. Le jour où un
      administrateur a déplacé le dernier compte concerné, il n'a plus rien trouvé et s'est mis à
      échouer sur un paramétrage légitime — sans qu'aucun défaut n'existe. Un cas qui dépend de la
      configuration du jour ne prouve rien de stable.

      La direction et le compte sont donc créés, puis supprimés — eux seuls, par identifiant.
    */
    const direction = await prisma.directions.create({
      data: {
        code: `ZZ_VERIF_${process.pid}_${Date.now()}`,
        libelle: `Direction de vérification ${process.pid}-${Date.now()}`,
        actif: true,
        site_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true, libelle: true },
    })

    const compte = await prisma.users.create({
      data: {
        name: 'Titulaire de vérification',
        email: `zz.titulaire.${process.pid}.${Date.now()}@exemple.test`,
        actif: true,
        direction_id: direction.id,
        doit_changer_mot_de_passe: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })

    try {
      const sansPersonne = await prisma.directions.count({
        where: { actif: true, site_id: null, users: { none: { actif: true } } },
      })
      const toutesSansSite = await prisma.directions.count({
        where: { actif: true, site_id: null },
      })

      expect(
        sansPersonne,
        `« ${direction.libelle} » a un titulaire et reste comptée comme injoignable`
      ).toBeLessThan(toutesSansSite)
    } finally {
      await prisma.users.delete({ where: { id: compte.id } })
      await prisma.directions.delete({ where: { id: direction.id } })
    }
  })

  it('ne compte comme « sans porteur » que des rôles réellement portés par personne', async () => {
    /*
      C'est le contrôle qui aurait signalé un défaut réel : `agent_relais` n'était porté par aucun
      compte, si bien que l'écran de saisie relais était inaccessible à tout le monde — sans que
      rien nulle part ne le dise.
    */
    const alerte = (await santeAdministration()).find((a) => a.cle === 'roles-vides')
    if (!alerte) return

    const roles = await prisma.roles.findMany({
      where: { actif: true },
      select: { id: true, name: true },
    })
    const liens = await prisma.model_has_roles.findMany({
      where: { model_type: MODEL_TYPE_USER },
      select: { role_id: true, model_id: true },
    })
    const actifs = new Set(
      (await prisma.users.findMany({ where: { actif: true }, select: { id: true } })).map((u) => u.id)
    )
    const portes = new Set(liens.filter((l) => actifs.has(l.model_id)).map((l) => l.role_id))

    const attendu = roles.filter((r) => !portes.has(r.id)).length

    expect(alerte.valeur).toBeLessThanOrEqual(attendu)
  })

  it('mène chaque alerte à la console qui la règle', async () => {
    // Un chiffre qui appelle une action sans y mener oblige à deviner où aller — c'est le défaut
    // qui avait été corrigé sur le tableau de bord des traitants.
    for (const alerte of await santeAdministration()) {
      expect(alerte.href, alerte.cle).toMatch(/^\/administration\//)
      expect(alerte.consequence.length, `${alerte.cle} : conséquence non énoncée`).toBeGreaterThan(20)
    }
  })
})

describe('Un référentiel vidé se signale', () => {
  it('remonte l’absence de lieu, qui bloque toute déclaration', async () => {
    /*
      Le lieu est OBLIGATOIRE sur les quatre formulaires depuis le 11/09. Vidé, il rend chaque
      déclaration impossible à envoyer — et rien, dans la console des lieux, ne le dirait.

      Le cas désactive les lieux le temps de la vérification, puis les rétablit exactement.
      Aucune ligne n'est supprimée : c'est `actif` qui bascule, et lui seul.
    */
    const avant = await prisma.lieux.findMany({ where: { actif: true }, select: { id: true } })
    if (avant.length === 0) return

    try {
      await prisma.lieux.updateMany({
        where: { id: { in: avant.map((l) => l.id) } },
        data: { actif: false },
      })

      const alerte = (await santeAdministration()).find((a) => a.cle === 'lieux')

      expect(alerte, 'un référentiel de lieux vide ne remonte pas').toBeDefined()
      expect(alerte?.bloquant).toBe(true)
    } finally {
      await prisma.lieux.updateMany({
        where: { id: { in: avant.map((l) => l.id) } },
        data: { actif: true },
      })
    }

    // Rétabli : l'alerte disparaît.
    expect((await santeAdministration()).some((a) => a.cle === 'lieux')).toBe(false)
  })
})

describe('La messagerie éteinte est signalée', () => {
  /*
    Le défaut rapporté : « le mail n'est pas reçu après création d'un compte ».

    Il n'y avait pas de panne — il n'y avait pas de messagerie. Sans `MAIL_HOST` ni `MAIL_FROM`,
    l'application journalise au lieu d'expédier : elle fonctionne, n'affiche aucune erreur, et pas
    un message ne sort. Rien nulle part ne le disait.
  */
  const ORIGINE = { host: process.env.MAIL_HOST, from: process.env.MAIL_FROM }

  afterEach(() => {
    process.env.MAIL_HOST = ORIGINE.host
    process.env.MAIL_FROM = ORIGINE.from
  })

  it('remonte l’alerte quand la configuration manque', async () => {
    delete process.env.MAIL_HOST
    delete process.env.MAIL_FROM

    const alerte = (await santeAdministration()).find((a) => a.cle === 'messagerie')

    expect(alerte, 'une messagerie éteinte passe inaperçue').toBeDefined()
    expect(alerte?.bloquant, 'présenté comme une négligence, pas comme un blocage').toBe(true)
    // La conséquence doit nommer ce qui ne part plus : « non configurée » seul n'apprend rien à
    // qui ignore ce qui en dépend.
    expect(alerte?.consequence).toMatch(/identifiants/i)
  })

  it('se tait quand le transport est configuré', async () => {
    process.env.MAIL_HOST = 'smtp.test.invalid'
    process.env.MAIL_FROM = 'mgp@test.invalid'

    const alerte = (await santeAdministration()).find((a) => a.cle === 'messagerie')

    expect(alerte, 'l’alerte persiste alors que le transport est en place').toBeUndefined()
  })
})
