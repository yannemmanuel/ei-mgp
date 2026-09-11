import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { santeAdministration } from '../sante-administration'

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

const MODEL_TYPE_USER = String.raw`App\Models\User`

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

  it('compte exactement les directions actives sans site', async () => {
    const attendu = await prisma.directions.count({ where: { actif: true, site_id: null } })
    const alerte = (await santeAdministration()).find((a) => a.cle === 'directions')

    expect(alerte?.valeur ?? 0).toBe(attendu)
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
      where: { guard_name: 'web', actif: true },
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
