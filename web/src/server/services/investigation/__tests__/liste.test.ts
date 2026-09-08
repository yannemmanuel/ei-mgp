import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { parcoursAutorises } from '@/server/authz'
import { listerInvestigations, referentielsInvestigations } from '../liste'
import { STATUTS_INVESTIGATION } from '../investigation'

/**
 * Vue transverse des investigations.
 *
 * Ces cas s'exécutent contre la base réelle et n'écrivent RIEN : ils confrontent ce que la liste
 * renvoie à ce que la base contient. Un test qui fabriquerait ses propres investigations ne
 * dirait rien du cloisonnement appliqué aux données existantes — c'est exactement l'angle mort
 * qui a laissé passer trois référentiels vides pendant des mois.
 */

/** Parcours réel de chaque investigation, lu sans aucun filtre d'autorisation. */
async function parcoursParInvestigation(): Promise<Map<string, string>> {
  const toutes = await prisma.investigations.findMany({
    select: { id: true, dossiers: { select: { parcours: { select: { code: true } } } } },
  })

  return new Map(toutes.map((i) => [i.id, i.dossiers.parcours.code]))
}

describe('Cloisonnement par parcours', () => {
  it('ne renvoie que les investigations des parcours ouverts au rôle', async () => {
    const reference = await parcoursParInvestigation()

    // Un rôle par périmètre : restreint à un parcours, restreint à trois, transverse, et aucun.
    for (const roles of [['rqse'], ['correspondant_mgp'], ['service_mgp'], ['administrateur_digital']] as const) {
      const utilisateur = utilisateurAvecRoles(...roles)
      const autorises = parcoursAutorises(utilisateur.roles)

      const { investigations } = await listerInvestigations(utilisateur, {}, 1)

      for (const investigation of investigations) {
        expect(
          autorises,
          `${roles[0]} ne devrait pas voir l’investigation ${investigation.id}`
        ).toContain(reference.get(investigation.id))
      }

      // Et symétriquement : rien de ce qui est autorisé ne manque à l'appel.
      const attendues = [...reference.entries()]
        .filter(([, parcours]) => (autorises as readonly string[]).includes(parcours))
        .map(([id]) => id)

      expect(investigations.length).toBe(Math.min(attendues.length, 20))
    }
  })

  it('ne montre RIEN à un rôle sans parcours', async () => {
    // `administrateur_digital` administre les comptes (DT-02) et n'a accès à aucun dossier : la liste doit
    // être vide, jamais complète par retombée d'une branche oubliée.
    const { investigations, total } = await listerInvestigations(
      utilisateurAvecRoles('administrateur_digital'),
      {},
      1
    )

    expect(investigations).toEqual([])
    expect(total).toBe(0)
  })
})

describe('Filtres', () => {
  it('ignore un statut qui n’appartient pas à la liste close', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')

    const sansFiltre = await listerInvestigations(utilisateur, {}, 1)
    const avecFantaisie = await listerInvestigations(utilisateur, { statut: 'inexistant' }, 1)

    // Une valeur d'URL bricolée ne doit pas produire une liste vide, que l'utilisateur lirait
    // comme « aucune donnée » au lieu de « critère invalide ».
    expect(avecFantaisie.total).toBe(sansFiltre.total)
  })

  it('restreint aux fiches du compte quand « les miennes » est actif', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')
    const { investigations } = await listerInvestigations(utilisateur, { miennes: true }, 1)

    for (const investigation of investigations) {
      const enqueteur = await prisma.investigations.findUniqueOrThrow({
        where: { id: investigation.id },
        select: { enqueteur_id: true },
      })

      expect(enqueteur.enqueteur_id).toBe(utilisateur.id)
    }
  })

  it('chaque statut filtré ne renvoie que des fiches de ce statut', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')

    for (const statut of STATUTS_INVESTIGATION) {
      const { investigations } = await listerInvestigations(utilisateur, { statut }, 1)

      for (const investigation of investigations) {
        expect(investigation.statut).toBe(statut)
      }
    }
  })
})

describe('Référentiels de filtre', () => {
  it('ne propose que des enquêteurs ayant réellement mené une investigation', async () => {
    const { enqueteurs } = await referentielsInvestigations()
    const menees = await prisma.investigations.findMany({
      distinct: ['enqueteur_id'],
      select: { enqueteur_id: true },
    })

    // Proposer les comptes actifs au complet donnerait une liste déroulante dont la quasi-totalité
    // des entrées ne ramènerait rien.
    expect(enqueteurs.length).toBe(menees.length)
  })
})
