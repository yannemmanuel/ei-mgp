import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { supprimerRole } from '../habilitations'
import { ErreurWorkflow } from '../../dossier/workflow'
import { readFileSync } from 'node:fs'

/**
 * Un rôle se supprime quand PERSONNE ne le porte — et seulement là.
 *
 * ⚠️ LA RÈGLE A CHANGÉ le 2026-09-20. Un rôle « livré » — nommé par le code — ne pouvait pas être
 * supprimé du tout, seulement désactivé. Il le peut désormais, à la même condition que les
 * autres : aucun compte rattaché.
 *
 * Le risque est assumé et documenté : le code se réfère à certains noms de rôle, et un rôle
 * supprimé cesse simplement d'être désigné par ces règles. La condition d'attribution, elle, ne
 * bouge pas — supprimer un rôle porté retirerait ses accès à quelqu'un sans qu'il l'ait décidé.
 */
const MODEL_TYPE_USER = String.raw`App\Models\User`

const rolesCrees: bigint[] = []
const liensCrees: bigint[] = []

afterEach(async () => {
  if (liensCrees.length > 0) {
    await prisma.model_has_roles.deleteMany({ where: { role_id: { in: liensCrees } } })
    liensCrees.length = 0
  }
  if (rolesCrees.length > 0) {
    await prisma.roles.deleteMany({ where: { id: { in: rolesCrees } } })
    rolesCrees.length = 0
  }
})

/** Un rôle jetable, créé pour ce cas et supprimé après lui. */
async function roleJetable(): Promise<{ id: bigint; name: string }> {
  const name = `test_suppression_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

  const role = await prisma.roles.create({
    data: {
      name,
      guard_name: 'web',
      libelle: 'Rôle de test',
      actif: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    select: { id: true, name: true },
  })

  rolesCrees.push(role.id)
  return role
}

const ACTEUR = { id: 1n }

describe('Suppression d’un rôle', () => {
  it('supprime un rôle que personne ne porte', async () => {
    const role = await roleJetable()

    await supprimerRole(ACTEUR, role.name)

    expect(await prisma.roles.count({ where: { id: role.id } })).toBe(0)

    rolesCrees.length = 0 // déjà supprimé : ne pas le rechercher au nettoyage
  })

  it('⚠️ REFUSE quand un compte le porte', async () => {
    /*
      La règle qui protège quelqu'un : supprimer un rôle attribué retirerait ses accès à son
      porteur sans que personne ne l'ait décidé pour lui, et sans qu'il en soit averti.
    */
    const role = await roleJetable()
    const compte = await prisma.users.findFirstOrThrow({ select: { id: true } })

    await prisma.model_has_roles.create({
      data: { role_id: role.id, model_type: MODEL_TYPE_USER, model_id: compte.id },
    })
    liensCrees.push(role.id)

    await expect(supprimerRole(ACTEUR, role.name)).rejects.toBeInstanceOf(ErreurWorkflow)

    expect(
      await prisma.roles.count({ where: { id: role.id } }),
      'le rôle a été supprimé malgré son porteur'
    ).toBe(1)
  })

  it('⚠️ refuse même un compte DÉSACTIVÉ qui le porte', async () => {
    // Un compte désactivé aujourd'hui peut être réactivé demain : il retrouverait alors un rôle
    // qui n'existe plus, c'est-à-dire aucun accès, sans que rien ne l'explique.
    const role = await roleJetable()

    const inactif = await prisma.users.findFirst({
      where: { actif: false },
      select: { id: true },
    })

    if (!inactif) return // aucun compte désactivé : le cas ne prouverait rien

    await prisma.model_has_roles.create({
      data: { role_id: role.id, model_type: MODEL_TYPE_USER, model_id: inactif.id },
    })
    liensCrees.push(role.id)

    await expect(supprimerRole(ACTEUR, role.name)).rejects.toBeInstanceOf(ErreurWorkflow)
  })

  it('⚠️ n’interdit plus un rôle au seul motif qu’il est LIVRÉ', async () => {
    /*
      ⚠️ CE CAS TIENT LE CHANGEMENT DE RÈGLE, et il le fait SANS TOUCHER À LA BASE.

      Un rôle nommé par le code était refusé d'emblée, quel que soit son nombre de porteurs ; seul
      compte désormais l'attribution.

      La première écriture de ce cas supprimait pour de bon `employe_declarant` : elle l'entourait
      d'une transaction annulée, mais `supprimerRole()` écrit par le client GLOBAL, hors de cette
      transaction — l'annulation n'annulait rien. Le rôle a dû être recréé à la main. Un cas qui
      détruit ce qu'il vérifie n'est pas un cas, et cette version lit donc la RÈGLE plutôt que de
      l'exercer sur une donnée réelle.
    */
    const source = readFileSync('src/server/services/administration/habilitations.ts', 'utf8')
    const suppression = source.slice(source.indexOf('export async function supprimerRole'))

    expect(
      suppression.slice(0, 1200),
      'le refus au motif « rôle livré » est revenu'
    ).not.toContain('fait partie des rôles livrés')

    expect(
      suppression,
      'la condition d’attribution a disparu : un rôle porté deviendrait supprimable'
    ).toContain('_count.model_has_roles > 0')
  })

  it('⚠️ refuse toujours un rôle livré QUE QUELQU’UN porte', async () => {
    // La moitié qui protège : le refus doit désormais parler d'attribution, et de rien d'autre.
    const porte = await prisma.model_has_roles.findFirst({
      where: { model_type: MODEL_TYPE_USER, roles: { guard_name: 'web' } },
      select: { roles: { select: { name: true } } },
    })

    expect(porte, 'aucun rôle n’est porté : le cas ne prouverait rien').not.toBeNull()
    if (!porte) return

    await expect(supprimerRole(ACTEUR, porte.roles.name)).rejects.toThrow(/portent encore/)
  })
})
