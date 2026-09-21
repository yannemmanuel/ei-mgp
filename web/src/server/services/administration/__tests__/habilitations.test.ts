import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PERMISSIONS, ROLES, ROLE_NAMES, type RoleLivre } from '@/server/authz'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  chargerHabilitations,
  creerRole,
  modifierPermissionsRole,
  nomTechnique,
  supprimerRole,
} from '../habilitations'

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
      // Un rôle créé depuis l'interface n'a pas de référence livrée : le code ne le connaît pas.
      expect(ligne.reference, `référence du rôle ${ligne.role}`).toEqual(
        ligne.livre ? ROLES[ligne.role as RoleLivre] : []
      )
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
      const reference = new Set<string>(ROLES[ecart.role as RoleLivre] ?? [])

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

    /*
      Le sens compte : une permission retirée PRIVE d'un accès prévu à la livraison, et doit donc
      être annoncée comme retirée — jamais comme ajoutée.

      On n'exige PAS que `ajoutees` soit vide. Les habilitations sont administrables : un
      administrateur peut légitimement accorder à un rôle une permission absente de la référence,
      et l'écart est précisément là pour le dire. L'exiger vide reviendrait à figer en règle la
      configuration d'un jour donné — le test virerait au rouge à la première décision d'un
      administrateur, sans qu'aucun code ait changé.
    */
    expect(ecart?.retirees).toContain('reporting.export.nominatif')
    expect(ecart?.ajoutees).not.toContain('reporting.export.nominatif')
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

  /**
   * Plancher d'identifiant : tout ce qui est écrit APRÈS appartient à ces cas de test.
   *
   * ⚠️ Le nettoyage supprimait toutes les lignes `role.permissions_modifiees`, sans distinguer
   * celles qu'il venait d'écrire de celles qu'un administrateur avait produites depuis l'écran.
   * Chaque exécution de la suite effaçait donc l'historique réel des ajustements de droits — sur
   * la base de développement, il n'en restait aucune, alors que l'écran signalait un rôle ajusté
   * et renvoyait vers un journal vide. Le journal est en ajout seul : c'est écrit sur l'écran
   * d'audit, et un test n'a pas à faire exception.
   */
  let plancherAudit = 0n

  beforeAll(async () => {
    const derniere = await prisma.audit_logs.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    })

    plancherAudit = derniere?.id ?? 0n
  })

  /** Rétablit l'état d'un rôle après un test : cette table décide de droits réels. */
  async function retablir(role: string, permissions: string[]) {
    const qui = await acteur()
    await modifierPermissionsRole(qui, role, permissions)
    await prisma.audit_logs.deleteMany({
      where: { action: 'role.permissions_modifiees', id: { gt: plancherAudit } },
    })
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

    // ⚠️ Compté au-dessus du plancher, pas sur toute la table : le journal contient désormais
    // les modifications réelles des administrateurs, que le nettoyage n'efface plus. Compter
    // globalement, c'était ne passer que parce que cet historique disparaissait.
    const traces = await prisma.audit_logs.count({
      where: { action: 'role.permissions_modifiees', id: { gt: plancherAudit } },
    })
    expect(traces, 'une opération sans changement a écrit dans le journal').toBe(0)
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

/**
 * Création et suppression de rôles.
 *
 * Ces cas ÉCRIVENT réellement : ils créent un rôle, le manipulent et le suppriment. Ils ne
 * touchent jamais un rôle existant — le nettoyage ne vise que ce qu'ils ont eux-mêmes créé, et le
 * nom choisi ne peut pas entrer en collision avec un rôle du CDC.
 */
describe('Création et suppression de rôles', () => {
  const LIBELLE = 'Rôle d’essai automatisé'
  const NOM = 'role_d_essai_automatise'

  async function acteur() {
    const u = await prisma.users.findFirstOrThrow({ orderBy: { id: 'asc' }, select: { id: true } })
    return { id: u.id }
  }

  async function effacerLesTraces() {
    const ligne = await prisma.roles.findFirst({ where: { name: NOM }, select: { id: true } })

    if (ligne) {
      await prisma.model_has_roles.deleteMany({ where: { role_id: ligne.id } })
      await prisma.role_has_permissions.deleteMany({ where: { role_id: ligne.id } })
      await prisma.roles.delete({ where: { id: ligne.id } })
    }

    // Seules les lignes écrites DEPUIS le début de ce bloc : le reste du journal est en ajout
    // seul, et un nettoyage par action seule effacerait l'historique réel des administrateurs.
    await prisma.audit_logs.deleteMany({
      where: { action: { in: ['role.cree', 'role.supprime'] }, id: { gt: plancherAudit } },
    })
  }

  let plancherAudit = 0n

  beforeAll(async () => {
    const derniere = await prisma.audit_logs.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    })

    plancherAudit = derniere?.id ?? 0n
  })

  afterEach(effacerLesTraces)

  it('dérive un identifiant technique lisible du libellé', () => {
    expect(nomTechnique('Rôle d’essai automatisé')).toBe(NOM)
    expect(nomTechnique('  Gestionnaire   des SUPPORTS  ')).toBe('gestionnaire_des_supports')
    expect(nomTechnique('Référent HSE (site A)')).toBe('referent_hse_site_a')
  })

  it('crée un rôle qui apparaît dans la liste et s’applique en base', async () => {
    const qui = await acteur()
    const nom = await creerRole(qui, {
      libelle: LIBELLE,
      description: 'Créé par la suite de tests.',
      permissions: ['qrcodes.manage'],
    })

    expect(nom).toBe(NOM)

    // La liste partait de `ROLE_NAMES` : un rôle créé n'y figurait pas, alors qu'il s'appliquait.
    const { lignes } = await chargerHabilitations()
    const ligne = lignes.find((l) => l.role === NOM)

    expect(ligne, 'le rôle créé n’apparaît pas dans la liste').toBeDefined()
    expect(ligne?.livre).toBe(false)
    expect(ligne?.permissions).toEqual(['qrcodes.manage'])
    expect(ligne?.actif).toBe(true)

    // Il n'ouvre aucun parcours : l'écran doit pouvoir le dire.
    expect(ligne?.parcours).toEqual([])
  })

  it('n’invente aucun écart pour un rôle sans référence livrée', async () => {
    const qui = await acteur()
    await creerRole(qui, { libelle: LIBELLE, description: null, permissions: ['qrcodes.manage'] })

    const { ecarts } = await chargerHabilitations()

    // Comparé à une référence vide, tout aurait été « ajouté » — un rôle créé serait apparu
    // « ajusté » dès sa naissance.
    expect(ecarts.some((e) => e.role === NOM)).toBe(false)
  })

  it('refuse un doublon de nom', async () => {
    const qui = await acteur()
    await creerRole(qui, { libelle: LIBELLE, description: null, permissions: [] })

    await expect(
      creerRole(qui, { libelle: LIBELLE, description: null, permissions: [] })
    ).rejects.toThrow(/porte déjà ce nom/i)
  })

  it('garde le catalogue des permissions fermé', async () => {
    const qui = await acteur()

    await expect(
      creerRole(qui, { libelle: LIBELLE, description: null, permissions: ['dossiers.supprimer'] })
    ).rejects.toThrow(/inconnue/i)

    // Et rien n'a été créé au passage.
    expect(await prisma.roles.count({ where: { name: NOM } })).toBe(0)
  })

  it('refuse un libellé qui ne donne aucun identifiant', async () => {
    const qui = await acteur()

    await expect(
      creerRole(qui, { libelle: '—— ——', description: null, permissions: [] })
    ).rejects.toThrow(/trois lettres ou chiffres/i)
  })

  it('supprime un rôle créé, et le journal en garde la trace', async () => {
    const qui = await acteur()
    await creerRole(qui, { libelle: LIBELLE, description: null, permissions: ['qrcodes.manage'] })

    await supprimerRole(qui, NOM)

    expect(await prisma.roles.count({ where: { name: NOM } })).toBe(0)

    // La ligne d'audit est écrite AVANT la suppression : après, plus rien ne relierait
    // l'identifiant au nom du rôle.
    const trace = await prisma.audit_logs.findFirst({
      where: { action: 'role.supprime' },
      orderBy: { id: 'desc' },
      select: { old_values: true },
    })

    const conserve = JSON.stringify(trace?.old_values)
    expect(conserve).toContain(NOM)
    expect(conserve).toContain('qrcodes.manage')
  })

  it('⚠️ refuse un rôle livré PARCE QU’IL EST PORTÉ, et non parce qu’il est livré', async () => {
    /*
      ⚠️ CE CAS A CHANGÉ DE MOTIF le 2026-09-20.

      Un rôle nommé par le code était refusé d'emblée. Il ne l'est plus : seule l'attribution
      compte, et c'est ce que le métier a demandé — « donner la possibilité de supprimer un rôle
      seulement quand il n'est pas attribué ».

      Le résultat observable reste le même pour ces trois rôles — ils sont portés, donc refusés —
      mais le MOTIF a changé, et c'est lui qu'on vérifie. Le risque du changement est documenté
      dans `supprimerRole()` : un rôle supprimé cesse d'être désigné par les règles qui le
      nomment, sans qu'aucune erreur ne le signale.
    */
    const qui = await acteur()

    for (const role of ['service_mgp', 'secretaire_csst', 'administrateur_digital']) {
      const porteurs = await prisma.model_has_roles.count({
        where: { model_type: MODEL_TYPE_USER, roles: { name: role, guard_name: 'web' } },
      })

      if (porteurs === 0) continue // non porté : il est désormais supprimable, rien à vérifier

      await expect(supprimerRole(qui, role)).rejects.toThrow(/portent encore/i)
    }

    expect(await prisma.roles.count({ where: { name: 'service_mgp' } })).toBe(1)
  })

  it('refuse de supprimer un rôle encore porté par un compte', async () => {
    const qui = await acteur()
    await creerRole(qui, { libelle: LIBELLE, description: null, permissions: [] })

    const ligne = await prisma.roles.findFirstOrThrow({
      where: { name: NOM },
      select: { id: true },
    })

    await prisma.model_has_roles.create({
      data: { role_id: ligne.id, model_type: MODEL_TYPE_USER, model_id: qui.id },
    })

    // Sans ce refus, le compte aurait perdu un accès sans que rien ne le dise, et l'association
    // aurait disparu avec le rôle : on ne saurait plus à qui rendre quoi.
    await expect(supprimerRole(qui, NOM)).rejects.toThrow(/portent encore/i)

    expect(await prisma.roles.count({ where: { name: NOM } })).toBe(1)
  })

  it('refuse de supprimer un rôle inconnu', async () => {
    const qui = await acteur()

    await expect(supprimerRole(qui, 'role_qui_n_existe_pas')).rejects.toThrow(/inconnu/i)
  })
})
