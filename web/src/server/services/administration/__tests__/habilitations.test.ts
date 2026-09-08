import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PERMISSIONS, ROLES, ROLE_NAMES, type Role } from '@/server/authz'
import { ErreurWorkflow } from '../../dossier/workflow'
import { chargerHabilitations, modifierPermissionsRole } from '../habilitations'

/**
 * Matrice des habilitations.
 *
 * Son intérêt n'est pas d'afficher une table : c'est de rendre visible un écart entre ce qui a
 * été décidé (le code) et ce qui s'applique (la base). Une dérive silencieuse signifie que
 * quelqu'un dispose d'un droit qui ne lui a pas été accordé, ou se voit refuser un accès prévu.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`
const associationsRetirees: { role_id: bigint; permission_id: bigint }[] = []

afterEach(async () => {
  // Rétablit toute association retirée par un test : cette table est une donnée réelle.
  for (const a of associationsRetirees) {
    await prisma.role_has_permissions.create({ data: a })
  }
  associationsRetirees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Lecture de la matrice', () => {
  it('expose tous les rôles et toutes les permissions', async () => {
    const { lignes, permissions } = await chargerHabilitations()

    expect(lignes.map((l) => l.role).sort()).toEqual([...ROLE_NAMES].sort())
    expect(permissions).toEqual(PERMISSIONS)
  })

  it('restitue ce qui S’APPLIQUE, lu en base, et la référence livrée', async () => {
    const { lignes } = await chargerHabilitations()

    for (const ligne of lignes) {
      const enBase = await prisma.roles.findFirst({
        where: { name: ligne.role, guard_name: 'web' },
        select: { role_has_permissions: { select: { permissions: { select: { name: true } } } } },
      })

      // C'est la base qui fait foi à l'exécution : l'écran doit montrer ce que
      // `chargerUtilisateurAutorise()` lira, pas ce que le code prévoyait.
      expect([...ligne.permissions].sort(), `rôle ${ligne.role}`).toEqual(
        (enBase?.role_has_permissions ?? []).map((r) => r.permissions.name).sort()
      )
      expect(ligne.reference, `référence du rôle ${ligne.role}`).toEqual(ROLES[ligne.role])
    }
  })

  it('compte les comptes ACTIFS porteurs de chaque rôle', async () => {
    const { lignes } = await chargerHabilitations()

    const attendu = await prisma.model_has_roles.count({
      where: { model_type: MODEL_TYPE_USER },
    })
    const total = lignes.reduce((somme, l) => somme + l.comptes, 0)

    // Tous les comptes de la base de développement sont actifs : le total doit coïncider.
    expect(total).toBe(attendu)
  })
})

describe('Détection d’écart', () => {
  it('ne rapporte QUE des écarts réels, dans le bon sens', async () => {
    /**
     * Ce cas affirmait « aucun écart » — et il a fini par échouer, non parce que le code avait
     * régressé, mais parce qu'un administrateur avait ajusté des permissions depuis l'écran des
     * habilitations. Depuis que ces associations sont modifiables, un écart n'est plus une
     * anomalie : c'est la trace d'une décision, et l'écran le dit ainsi.
     *
     * Ce qui doit rester vrai, c'est que l'écart rapporté correspond EXACTEMENT à la différence
     * entre le code et la base — ni un écart inventé, ni un écart tu.
     */
    const { ecarts } = await chargerHabilitations()

    for (const ecart of ecarts) {
      const role = await prisma.roles.findFirstOrThrow({
        where: { name: ecart.role },
        select: {
          role_has_permissions: { select: { permissions: { select: { name: true } } } },
        },
      })

      const enBase = new Set(role.role_has_permissions.map((r) => r.permissions.name))
      const reference = new Set<string>(ROLES[ecart.role as Role] ?? [])

      for (const ajoutee of ecart.ajoutees) {
        expect(enBase.has(ajoutee), `« ${ajoutee} » annoncée ajoutée mais absente de la base`).toBe(true)
        expect(reference.has(ajoutee), `« ${ajoutee} » annoncée ajoutée mais présente en référence`).toBe(false)
      }

      for (const retiree of ecart.retirees) {
        expect(enBase.has(retiree), `« ${retiree} » annoncée retirée mais présente en base`).toBe(false)
        expect(reference.has(retiree), `« ${retiree} » annoncée retirée mais absente de la référence`).toBe(true)
      }

      expect(
        ecart.ajoutees.length + ecart.retirees.length,
        `« ${ecart.role} » figure dans les écarts sans en avoir aucun`
      ).toBeGreaterThan(0)
    }
  })

  it('signale une permission retirée de la base', async () => {
    const role = await prisma.roles.findFirstOrThrow({
      where: { name: 'service_mgp' },
      select: { id: true },
    })
    const permission = await prisma.permissions.findFirstOrThrow({
      where: { name: 'reporting.export.nominatif' },
      select: { id: true },
    })

    await prisma.role_has_permissions.delete({
      where: { permission_id_role_id: { permission_id: permission.id, role_id: role.id } },
    })
    associationsRetirees.push({ role_id: role.id, permission_id: permission.id })

    const { ecarts } = await chargerHabilitations()
    const ecart = ecarts.find((e) => e.role === 'service_mgp')

    // Le sens compte : une permission retirée PRIVE d'un accès prévu à la livraison.
    expect(ecart?.retirees).toContain('reporting.export.nominatif')
    expect(ecart?.ajoutees).toEqual([])
  })
})

describe('Modification des habilitations', () => {
  const GUARD = 'web'

  async function acteur() {
    const u = await prisma.users.findFirstOrThrow({ orderBy: { id: 'asc' }, select: { id: true } })
    return { id: u.id }
  }

  async function permissionsDe(role: string): Promise<string[]> {
    const ligne = await prisma.roles.findFirstOrThrow({
      where: { name: role, guard_name: GUARD },
      select: { role_has_permissions: { select: { permissions: { select: { name: true } } } } },
    })

    return ligne.role_has_permissions.map((r) => r.permissions.name).sort()
  }

  /** Rétablit l'état d'un rôle après un test : cette table décide de droits réels. */
  async function retablir(role: string, permissions: string[]) {
    const qui = await acteur()
    await modifierPermissionsRole(qui, role, permissions)
    await prisma.audit_logs.deleteMany({ where: { action: 'role.permissions_modifiees' } })
  }

  it('retire et ajoute une permission, avec effet en base', async () => {
    const qui = await acteur()
    const avant = await permissionsDe('auditeur')

    try {
      await modifierPermissionsRole(qui, 'auditeur', ['audit.view'])

      expect(await permissionsDe('auditeur')).toEqual(['audit.view'])

      await modifierPermissionsRole(qui, 'auditeur', ['audit.view', 'reporting.view'])

      expect(await permissionsDe('auditeur')).toEqual(['audit.view', 'reporting.view'])
    } finally {
      await retablir('auditeur', avant)
    }

    expect(await permissionsDe('auditeur')).toEqual(avant)
  })

  it('journalise le changement avec son avant et son après', async () => {
    const qui = await acteur()
    const avant = await permissionsDe('auditeur')

    try {
      await modifierPermissionsRole(qui, 'auditeur', ['audit.view'])

      const [trace] = await prisma.audit_logs.findMany({
        where: { action: 'role.permissions_modifiees' },
        orderBy: { id: 'desc' },
        take: 1,
        select: { user_id: true, old_values: true, new_values: true },
      })

      // La traçabilité remplace la comparaison automatique code/base qui protégeait ces
      // associations tant qu'elles étaient figées : un droit accordé doit rester explicable.
      expect(trace.user_id).toBe(qui.id)
      expect((trace.old_values as Record<string, unknown>).permissions).toEqual(avant)
      expect((trace.new_values as Record<string, unknown>).permissions).toEqual(['audit.view'])
    } finally {
      await retablir('auditeur', avant)
    }
  })

  it('n’écrit rien quand la liste est inchangée', async () => {
    const qui = await acteur()
    const actuelles = await permissionsDe('auditeur')

    await modifierPermissionsRole(qui, 'auditeur', actuelles)

    const traces = await prisma.audit_logs.count({
      where: { action: 'role.permissions_modifiees' },
    })
    expect(traces).toBe(0)
  })

  it('refuse un nom de rôle ou de permission hors catalogue', async () => {
    const qui = await acteur()

    await expect(modifierPermissionsRole(qui, 'role_invente', [])).rejects.toBeInstanceOf(
      ErreurWorkflow
    )

    // Le catalogue reste fermé : on ajuste qui obtient quoi, jamais ce qui existe.
    await expect(
      modifierPermissionsRole(qui, 'auditeur', ['audit.view', 'dossiers.supprimer'])
    ).rejects.toThrow(/inconnue/i)
  })

  it('interdit de retirer le dernier accès administrateur', async () => {
    const qui = await acteur()
    const avant = await permissionsDe('administrateur_digital')

    // `administrateur_digital` est le seul rôle porteur de `roles.manage` : le lui retirer
    // rendrait l'écran inaccessible à tous, sans aucun moyen de revenir en arrière — il n'y a
    // plus d'application Laravel ni de commande pour le faire.
    await expect(
      modifierPermissionsRole(
        qui,
        'administrateur_digital',
        avant.filter((p) => p !== 'roles.manage')
      )
      // Le message dit « dernier rôle ACTIF habilité » depuis que la désactivation d'un rôle
      // produit le même effet que le retrait de la permission : les deux chemins passent par le
      // même contrôle, qui raisonne sur l'état résultant.
    ).rejects.toThrow(/dernier rôle actif habilité|aucun compte actif/i)

    expect(await permissionsDe('administrateur_digital')).toEqual(avant)
  })
})
