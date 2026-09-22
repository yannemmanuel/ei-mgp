import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { peutConsulterJournalAudit, peutVoirAdresseIpAudit } from '@/server/authz'
import type { UtilisateurAutorise } from '@/server/authz'
import { consulterJournal } from '../consultation'
import { journaliser } from '../journal'
import { MODELES } from '@/server/modeles'

/**
 * Consultation du journal (docs/exigences-audit.md §4 et §5).
 *
 * Le point sensible n'est pas la lecture, c'est ce qui reste INVISIBLE : l'IP et le user-agent
 * de soumission peuvent réidentifier un déclarant anonyme. `service_mgp` a accès au journal sans
 * y avoir droit.
 */
const MODEL_TYPE_DOSSIER = MODELES.dossier
const ID_TEST = 'test-consultation-audit'

function utilisateur(roles: string[], permissions: string[]): UtilisateurAutorise {
  return {
    id: 1n,
    actif: true,
    roles,
    permissions: new Set(permissions),
  } as unknown as UtilisateurAutorise
}

afterEach(async () => {
  await prisma.audit_logs.deleteMany({
    where: { auditable_type: MODEL_TYPE_DOSSIER, auditable_id: ID_TEST },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Restriction de l’adresse IP (§5)', () => {
  it('n’accorde la vue de l’origine qu’au DPO et à l’auditeur', () => {
    for (const role of ['dpo', 'auditeur']) {
      expect(peutVoirAdresseIpAudit(utilisateur([role], ['audit.view']))).toBe(true)
    }

    // `service_mgp` consulte le journal — sans voir l'origine des soumissions.
    const mgp = utilisateur(['service_mgp'], ['audit.view'])
    expect(peutConsulterJournalAudit(mgp)).toBe(true)
    expect(peutVoirAdresseIpAudit(mgp)).toBe(false)
  })

  it('ne LIT même pas l’origine quand le rôle n’y a pas droit', async () => {
    await prisma.audit_logs.create({
      data: {
        action: 'test.consultation',
        auditable_type: MODEL_TYPE_DOSSIER,
        auditable_id: ID_TEST,
        ip_address: '203.0.113.42',
        user_agent: 'Navigateur de test',
        created_at: new Date(),
      },
    })

    const restreint = await consulterJournal({ action: 'test.consultation' }, 1, false)
    const complet = await consulterJournal({ action: 'test.consultation' }, 1, true)

    // Ni dans le champ dédié, ni ailleurs dans l'objet renvoyé : la valeur n'est pas chargée.
    expect(JSON.stringify(restreint.lignes)).not.toContain('203.0.113.42')
    expect(restreint.lignes[0].adresseIp).toBeNull()

    expect(complet.lignes[0].adresseIp).toBe('203.0.113.42')
  })
})

describe('Filtres et pagination', () => {
  it('filtre par action et par intervalle de dates', async () => {
    const ancien = new Date()
    ancien.setFullYear(ancien.getFullYear() - 3)

    await prisma.audit_logs.createMany({
      data: [
        {
          action: 'test.consultation',
          auditable_type: MODEL_TYPE_DOSSIER,
          auditable_id: ID_TEST,
          created_at: ancien,
        },
        {
          action: 'test.consultation',
          auditable_type: MODEL_TYPE_DOSSIER,
          auditable_id: ID_TEST,
          created_at: new Date(),
        },
      ],
    })

    expect((await consulterJournal({ action: 'test.consultation' })).total).toBe(2)

    const recent = new Date()
    recent.setFullYear(recent.getFullYear() - 1)

    expect(
      (await consulterJournal({ action: 'test.consultation', dateDebut: recent })).total
    ).toBe(1)
  })

  it('inclut toute la journée de la borne de fin', async () => {
    await prisma.audit_logs.create({
      data: {
        action: 'test.consultation',
        auditable_type: MODEL_TYPE_DOSSIER,
        auditable_id: ID_TEST,
        // 23h : un `lte` posé à minuit exclurait cette ligne du jour sélectionné.
        created_at: new Date(new Date().setHours(23, 0, 0, 0)),
      },
    })

    const aujourdhui = new Date()
    const page = await consulterJournal({ action: 'test.consultation', dateFin: aujourdhui })

    expect(page.total).toBe(1)
  })
})

describe('Ajout seul', () => {
  it('n’expose aucune fonction de modification ni de suppression', async () => {
    const lecture = await import('../consultation')
    const ecriture = await import('../journal')

    const noms = [...Object.keys(lecture), ...Object.keys(ecriture)]

    // Garde-fou structurel : le journal est en ajout seul, sans exception (§3). Si une fonction
    // de modification apparaissait, ce test le signalerait avant qu'une route ne l'expose.
    expect(noms.filter((n) => /supprimer|delete|modifier|update|purger/i.test(n))).toEqual([])
  })

  it('écrit une ligne exploitable hors requête HTTP', async () => {
    await journaliser({
      action: 'test.consultation',
      auditableType: MODEL_TYPE_DOSSIER,
      auditableId: ID_TEST,
      nouvelles: { champ: 'valeur' },
    })

    const page = await consulterJournal({ action: 'test.consultation' })

    expect(page.lignes[0].auditableType).toBe(MODEL_TYPE_DOSSIER)
    expect(page.lignes[0].nouvelles).toEqual({ champ: 'valeur' })
    // Hors requête HTTP : pas d'acteur — une tâche planifiée ou un script n'en a pas.
    expect(page.lignes[0].acteur).toBeNull()
  })
})
