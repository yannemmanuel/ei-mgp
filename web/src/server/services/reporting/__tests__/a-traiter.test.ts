import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { dateLimite } from '../../dossier/delais'
import { listerDossiers, perimetreDossiers } from '../../dossier/liste'
import type { StatutCode } from '../../dossier/statuts'
import { aTraiter } from '../a-traiter'

/**
 * Ce que le tableau de bord annonce comme « à traiter ».
 *
 * Ces deux chiffres décident de ce qu'on fait le matin : les compter faux est pire que ne pas les
 * compter. Les cas ci-dessous les recalculent autrement — dossier par dossier, avec le calcul
 * unitaire d'échéance — et comparent.
 */
describe('Dossiers en retard', () => {
  it('compte exactement ce que le calcul unitaire trouve, dossier par dossier', async () => {
    for (const role of ['service_mgp', 'secretaire_csst', 'correspondant_mgp'] as const) {
      const u = utilisateurAvecRoles(role)
      const annonce = await aTraiter(u)

      // Recompte indépendant : tout le périmètre, échéance calculée à l'unité.
      const dossiers = await prisma.dossiers.findMany({
        where: perimetreDossiers(u),
        select: {
          id: true,
          parcours_id: true,
          statuts_dossier: { select: { code: true } },
        },
      })

      const maintenant = Date.now()
      let attendu = 0

      for (const dossier of dossiers) {
        const limite = await dateLimite({
          id: dossier.id,
          statutCode: dossier.statuts_dossier.code as StatutCode,
          parcoursId: dossier.parcours_id,
        })

        if (limite && limite.getTime() < maintenant) attendu += 1
      }

      expect(annonce.enRetard, `${role} : décompte des retards divergent`).toBe(attendu)
    }
  })

  it('ne compte jamais plus de retards que de dossiers visibles', async () => {
    for (const role of ['service_mgp', 'secretaire_csst', 'auditeur'] as const) {
      const u = utilisateurAvecRoles(role)
      const { enRetard, miens, miensEnRetard } = await aTraiter(u)
      const { total } = await listerDossiers(u, {}, 1)

      expect(enRetard, `${role}`).toBeLessThanOrEqual(total)
      expect(miensEnRetard, `${role} : plus de retards à moi que de dossiers à moi`).toBeLessThanOrEqual(miens)
      expect(miensEnRetard, `${role} : plus de retards à moi que de retards au total`).toBeLessThanOrEqual(enRetard)
    }
  })
})

describe('Reçus sans destinataire', () => {
  it('correspond au filtre que la carte propose d’ouvrir', async () => {
    // Le chiffre mène à `/dossiers?nonAffectes=1` : les deux doivent dire la même chose, sans quoi
    // on clique sur « 5 » pour découvrir autre chose.
    for (const role of ['service_mgp', 'secretaire_csst', 'correspondant_mgp'] as const) {
      const u = utilisateurAvecRoles(role)

      const { nonAffectes } = await aTraiter(u)
      const { total } = await listerDossiers(u, { nonAffectes: true }, 1)

      expect(nonAffectes, `${role} : la carte et la liste ne comptent pas pareil`).toBe(total)
    }
  })

  it('ne retient que des dossiers « Reçu » réellement sans affectation active', async () => {
    const u = utilisateurAvecRoles('service_mgp')
    const { dossiers } = await listerDossiers(u, { nonAffectes: true }, 1)

    for (const d of dossiers) {
      expect(d.statuts_dossier.code).toBe('recu')

      const affectations = await prisma.dossier_affectations.count({
        where: { dossier_id: d.id, actif: true },
      })
      expect(affectations, `${d.reference} a une affectation active`).toBe(0)
    }
  })
})

describe('Rôle sans périmètre', () => {
  it('ne rapporte rien à qui ne voit aucun dossier (DT-02)', async () => {
    const { enRetard, nonAffectes, miens, miensEnRetard } = await aTraiter(
      utilisateurAvecRoles('administrateur_digital')
    )

    expect([enRetard, nonAffectes, miens, miensEnRetard]).toEqual([0, 0, 0, 0])
  })
})
