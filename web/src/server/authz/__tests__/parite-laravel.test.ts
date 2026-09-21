import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PERMISSIONS } from '../permissions'
import { ROLE_NAMES } from '../roles'

/**
 * Intégrité du CATALOGUE d'autorisation : le code et la base parlent-ils des mêmes rôles et des
 * mêmes permissions ?
 *
 * Les tests de policy ci-à-côté vérifient que la LOGIQUE est correcte ; celui-ci vérifie les
 * DONNÉES sur lesquelles elle s'appuie.
 *
 * ⚠️ LE PARTAGE DES RESPONSABILITÉS A CHANGÉ DEUX FOIS.
 *
 * D'abord quand les habilitations sont devenues modifiables : le code décidait ce qui EXISTE, la
 * base qui obtient quoi. Puis le 2026-09-21, quand les RÔLES eux-mêmes sont sortis du code — on
 * en crée et on en supprime depuis l'écran des habilitations, sans déploiement.
 *
 * Les PERMISSIONS restent un catalogue fermé, et c'est cohérent : chacune correspond à un endroit
 * du code qui la lit, en ajouter une demande donc d'écrire ce code. Les RÔLES, eux, ne sont plus
 * qu'une référence de départ (`ROLE_NAMES` — la configuration livrée).
 *
 * Ce que ce fichier garantit donc désormais :
 *
 * - le catalogue des PERMISSIONS coïncide exactement avec la base ;
 * - aucune association ne référence une permission hors catalogue (une écriture hors service) ;
 * - au moins un compte actif peut encore gérer les habilitations (invariant de survie).
 *
 * ⚠️ CE QU'IL NE GARANTIT PLUS, ET POURQUOI : que les rôles du code et ceux de la base coïncident.
 * Les deux écarts sont désormais des gestes d'administration légitimes — un rôle créé depuis
 * l'écran est absent du code, un rôle livré supprimé depuis l'écran est absent de la base. Les
 * interdire ici aurait fait échouer la suite sur l'usage normal de la fonctionnalité. L'écart
 * n'est pas nié pour autant : il est RAPPORTÉ, et `habilitations.test.ts` le vérifie.
 *
 * Lecture seule — aucune écriture n'est effectuée.
 */
const GUARD = 'web'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Parité avec la base Laravel', () => {
  it('déclare exactement les mêmes permissions que la table `permissions`', async () => {
    const enBase = await prisma.permissions.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    expect([...PERMISSIONS].sort()).toEqual(enBase.map((p) => p.name).sort())
  })

  it('⚠️ n’exige PLUS que les rôles du code et de la base coïncident', async () => {
    /*
      Ce cas affirmait l'égalité exacte. Elle n'a plus de sens depuis que les rôles se créent et se
      suppriment depuis l'écran : le premier rôle créé par un administrateur aurait fait échouer
      la suite, et la suppression d'un rôle livré aussi — deux gestes que la fonctionnalité existe
      précisément pour permettre.

      Ce qui reste vrai, et qui est vérifié ici : chaque rôle porte un nom technique exploitable.
      Un nom vide ou avec des espaces casserait les comparaisons partout où le code résout un rôle
      par son nom (`model_has_roles`, le journal d'audit, les écrans d'administration).
    */
    const enBase = await prisma.roles.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    expect(enBase.length, 'aucun rôle en base : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const role of enBase) {
      expect(role.name, `« ${role.name} » n’est pas un nom technique exploitable`).toMatch(
        /^[a-z0-9_]+$/
      )
    }
  })

  /**
   * Les associations rôle × permission ne sont PLUS figées : elles se règlent depuis
   * `/administration/habilitations`, et la base fait foi à l'exécution. Les comparer au code
   * ferait échouer la suite au premier ajustement légitime.
   *
   * Ce qui reste verrouillé, c'est le CATALOGUE — quels rôles et quelles permissions existent.
   * Le contrôle de dérive qu'assurait l'ancienne comparaison est repris par trois autres moyens :
   * la validation stricte du service, l'invariant du dernier administrateur, et la journalisation
   * de chaque changement (`role.permissions_modifiees`).
   */
  it('n\'associe que des rôles et des permissions du catalogue', async () => {
    const associations = await prisma.role_has_permissions.findMany({
      select: {
        roles: { select: { name: true, guard_name: true } },
        permissions: { select: { name: true, guard_name: true } },
      },
    })

    // Une association vers un nom inconnu signifierait qu'une écriture a contourné le service,
    // qui n'accepte que des valeurs du catalogue.
    for (const a of associations) {
      if (a.roles.guard_name !== GUARD || a.permissions.guard_name !== GUARD) continue

      expect(ROLE_NAMES, `rôle « ${a.roles.name} »`).toContain(a.roles.name)
      expect(PERMISSIONS, `permission « ${a.permissions.name} »`).toContain(a.permissions.name)
    }
  })

  it('⚠️ SIGNALE un rôle livré que la base n’a plus, au lieu de l’interdire', async () => {
    /*
      Un rôle livré absent de la base ne s'applique à personne, et les comptes qui le portaient
      ont perdu leurs droits. Ce cas l'INTERDISAIT ; il ne le peut plus — supprimer un rôle depuis
      l'écran est un geste normal depuis le 2026-09-21, et c'est arrivé le jour même.

      Le risque reste réel, et il est donc traité là où un administrateur peut agir : l'écart
      remonte dans l'écran des habilitations, avec la liste des droits que ce rôle conférait.
      Interdire ce que le métier a demandé d'autoriser n'aurait fait que déplacer le problème dans
      une suite rouge que personne ne lit plus.
    */
    const { ecarts } = await import('@/server/services/administration/habilitations').then((m) =>
      m.chargerHabilitations()
    )

    const enBase = await prisma.roles.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    const noms = new Set(enBase.map((r) => r.name))
    const manquants = ROLE_NAMES.filter((role) => !noms.has(role))

    for (const role of manquants) {
      const ecart = ecarts.find((e) => e.role === role)

      expect(ecart, `« ${role} » a disparu de la base sans être signalé`).toBeDefined()
      expect(
        ecart?.retirees.length,
        `« ${role} » est signalé sans dire quels droits il conférait`
      ).toBeGreaterThan(0)
    }
  })

  it('conserve au moins un compte actif habilité à gérer les habilitations', async () => {
    const porteurs = await prisma.roles.findMany({
      where: {
        guard_name: GUARD,
        // `actif` compte autant que la permission : depuis que les rôles se désactivent, un rôle
        // éteint ne confère plus rien (`chargerUtilisateurAutorise`). L'omettre ici ferait passer
        // l'invariant au vert alors que plus personne ne peut ouvrir l'écran.
        actif: true,
        role_has_permissions: { some: { permissions: { name: 'roles.manage', guard_name: GUARD } } },
      },
      select: { name: true },
    })

    const associations = await prisma.model_has_roles.findMany({
      where: { roles: { name: { in: porteurs.map((r) => r.name) } } },
      select: { model_id: true },
    })

    const actifs = await prisma.users.count({
      where: { actif: true, id: { in: associations.map((a) => a.model_id) } },
    })

    // Invariant de survie : sans lui, plus aucune interface ne permet de rétablir des droits —
    // il n'y a plus d'application Laravel ni de commande pour le faire.
    expect(actifs, 'comptes actifs pouvant gérer les habilitations').toBeGreaterThan(0)
  })
})
