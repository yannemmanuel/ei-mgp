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
      const autorises = parcoursAutorises(utilisateur)

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

  it('filtre sur le statut du DOSSIER, distinct de celui de la fiche', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')
    const { statutsDossier } = await referentielsInvestigations()

    expect(statutsDossier.length, 'aucun statut proposé : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const statut of statutsDossier) {
      const { investigations } = await listerInvestigations(
        utilisateur,
        { statutDossierId: String(statut.id) },
        1
      )

      for (const investigation of investigations) {
        expect(
          investigation.dossiers.statuts_dossier.libelle_interne,
          `${investigation.dossiers.reference} ne devrait pas figurer sous « ${statut.libelle_interne} »`
        ).toBe(statut.libelle_interne)
      }
    }
  })

  /**
   * Les deux filtres portent sur la même relation `dossiers`.
   *
   * Les écrire l'un après l'autre dans `where.dossiers` faisait perdre le premier — sans erreur,
   * sans liste vide : juste des lignes en trop, que personne ne recompte. C'est la forme de
   * défaut la plus difficile à voir à l'écran.
   */
  it('cumule le filtre de parcours et celui du statut du dossier', async () => {
    const utilisateur = utilisateurAvecRoles('service_mgp')
    const { parcours, statutsDossier } = await referentielsInvestigations()

    for (const p of parcours) {
      for (const s of statutsDossier) {
        const { investigations } = await listerInvestigations(
          utilisateur,
          { parcoursId: String(p.id), statutDossierId: String(s.id) },
          1
        )

        for (const investigation of investigations) {
          const reel = await prisma.investigations.findUniqueOrThrow({
            where: { id: investigation.id },
            select: { dossiers: { select: { parcours_id: true, statut_id: true } } },
          })

          expect(reel.dossiers.parcours_id, 'le filtre de parcours a été écrasé').toBe(p.id)
          expect(reel.dossiers.statut_id, 'le filtre de statut a été écrasé').toBe(s.id)
        }
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

  it('ne propose que des statuts de dossier réellement portés par une fiche', async () => {
    const { statutsDossier } = await referentielsInvestigations()
    const portes = await prisma.dossiers.findMany({
      where: { investigations: { some: {} } },
      distinct: ['statut_id'],
      select: { statut_id: true },
    })

    // Même raison que pour les enquêteurs : sur dix statuts, huit ne ramèneraient rien.
    expect(statutsDossier.map((s) => s.id).sort()).toEqual(
      portes.map((d) => d.statut_id).sort()
    )
  })
})
