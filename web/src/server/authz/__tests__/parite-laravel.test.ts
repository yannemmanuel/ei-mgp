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
 * ⚠️ Le partage des responsabilités a changé quand les habilitations sont devenues modifiables
 * depuis l'application : le code décide ce qui EXISTE (36 permissions, 15 rôles), la base décide
 * qui obtient quoi. Les associations ne sont donc plus comparées au code — les figer ferait
 * échouer la suite au premier ajustement légitime. Ce que ce fichier garantit désormais :
 *
 * - aucune association ne référence un nom hors catalogue (une écriture hors service) ;
 * - chaque rôle du catalogue existe bien en base (sinon ses porteurs perdent leurs droits) ;
 * - au moins un compte actif peut encore gérer les habilitations (invariant de survie).
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

  it('déclare exactement les mêmes rôles que la table `roles`', async () => {
    const enBase = await prisma.roles.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    expect([...ROLE_NAMES].sort()).toEqual(enBase.map((r) => r.name).sort())
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

  it('laisse chaque rôle du catalogue exister en base', async () => {
    const enBase = await prisma.roles.findMany({
      where: { guard_name: GUARD },
      select: { name: true },
    })

    // Un rôle absent de la base ne s'applique à personne : les comptes qui le portent perdraient
    // leurs droits en silence.
    for (const role of ROLE_NAMES) {
      expect(enBase.map((r) => r.name)).toContain(role)
    }
  })

  it('conserve au moins un compte actif habilité à gérer les habilitations', async () => {
    const porteurs = await prisma.roles.findMany({
      where: {
        guard_name: GUARD,
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
