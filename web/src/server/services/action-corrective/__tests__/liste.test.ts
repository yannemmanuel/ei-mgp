import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { parcoursAutorises } from '@/server/authz'
import { joursAvantEcheance, listerActions, referentielsActions } from '../liste'
import { STATUTS_ACTION } from '../action-corrective'

/**
 * Vue transverse des actions correctives. Comme pour les investigations, ces cas lisent la base
 * réelle et n'y écrivent rien.
 */

async function parcoursParAction(): Promise<Map<string, string>> {
  const toutes = await prisma.actions_correctives.findMany({
    select: { id: true, dossiers: { select: { parcours: { select: { code: true } } } } },
  })

  return new Map(toutes.map((a) => [a.id, a.dossiers.parcours.code]))
}

describe('Cloisonnement par parcours', () => {
  it('ne renvoie que les actions des parcours ouverts au rôle', async () => {
    const reference = await parcoursParAction()

    for (const roles of [['rqse'], ['correspondant_mgp'], ['service_mgp'], ['administrateur_digital']] as const) {
      const utilisateur = utilisateurAvecRoles(...roles)
      const autorises = parcoursAutorises(utilisateur)

      const { actions } = await listerActions(utilisateur, {}, 1)

      for (const action of actions) {
        expect(autorises, `${roles[0]} ne devrait pas voir l’action ${action.id}`).toContain(
          reference.get(action.id)
        )
      }

      const attendues = [...reference.values()].filter((parcours) =>
        (autorises as readonly string[]).includes(parcours)
      )

      expect(actions.length).toBe(Math.min(attendues.length, 20))
    }
  })

  it('ne montre RIEN à un rôle sans parcours', async () => {
    const { actions, total } = await listerActions(utilisateurAvecRoles('administrateur_digital'), {}, 1)

    expect(actions).toEqual([])
    expect(total).toBe(0)
  })
})

describe('Filtres et tri', () => {
  it('ignore un statut qui n’appartient pas à la liste close', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')

    const sansFiltre = await listerActions(utilisateur, {}, 1)
    const avecFantaisie = await listerActions(utilisateur, { statut: 'inexistant' }, 1)

    expect(avecFantaisie.total).toBe(sansFiltre.total)
  })

  it('chaque statut filtré ne renvoie que des actions de ce statut', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')

    for (const statut of STATUTS_ACTION) {
      const { actions } = await listerActions(utilisateur, { statut }, 1)

      for (const action of actions) {
        expect(action.statut).toBe(statut)
      }
    }
  })

  it('trie de l’échéance la plus proche à la plus lointaine', async () => {
    // C'est un écran de travail : l'ordre EST l'information. Un tri par date de création
    // enterrerait l'action qui expire demain sous celles créées après elle.
    const { actions } = await listerActions(utilisateurAvecRoles('service_mgp'), {}, 1)

    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].echeance.getTime()).toBeGreaterThanOrEqual(
        actions[i - 1].echeance.getTime()
      )
    }
  })
})

describe('Décompte avant échéance', () => {
  it('est négatif une fois l’échéance passée, nul le jour même', () => {
    const reference = new Date('2026-09-08T14:30:00')

    expect(joursAvantEcheance(new Date('2026-09-08T00:00:00'), reference)).toBe(0)
    expect(joursAvantEcheance(new Date('2026-09-11T00:00:00'), reference)).toBe(3)
    expect(joursAvantEcheance(new Date('2026-09-04T00:00:00'), reference)).toBe(-4)
  })

  it('compte en jours entiers, quelle que soit l’heure de consultation', () => {
    // L'échéance est une DATE en base (`@db.Date`) : consulter l'écran à 8 h ou à 23 h doit
    // afficher le même nombre de jours, sinon le décompte change sous les yeux de l'utilisateur.
    const echeance = new Date('2026-09-11T00:00:00')

    expect(joursAvantEcheance(echeance, new Date('2026-09-08T00:01:00'))).toBe(3)
    expect(joursAvantEcheance(echeance, new Date('2026-09-08T23:59:00'))).toBe(3)
  })
})

describe('Référentiels de filtre', () => {
  it('ne propose que des responsables portant réellement une action', async () => {
    const { responsables } = await referentielsActions()
    const porteurs = await prisma.actions_correctives.findMany({
      distinct: ['responsable_id'],
      select: { responsable_id: true },
    })

    expect(responsables.length).toBe(porteurs.length)
  })
})
