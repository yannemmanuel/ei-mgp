import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { chargerUtilisateurAutorise } from '@/server/authz'
import { dateLimite } from '../../dossier/delais'
import { listerDossiers, perimetreDossiers } from '../../dossier/liste'
import type { StatutCode } from '../../dossier/statuts'
import { aTraiter, dossiersATraiter } from '../a-traiter'


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

/**
 * L'aperçu « Vos dossiers à traiter » et la liste doivent montrer le MÊME périmètre.
 *
 * ⚠️ L'aperçu ne regardait que `dossier_affectations`, sans vérifier aucun droit. L'administrateur
 * digital — à qui DT-02 refuse délibérément tout accès aux déclarations — se voyait ainsi
 * présenter la référence, la catégorie et le statut de deux dossiers qui lui avaient été
 * affectés, sur un écran d'où la liste et la fiche lui étaient bien refusées. Chaque ligne menait
 * de surcroît vers une page répondant « introuvable ».
 *
 * C'est la forme la plus tenace du défaut : une seule requête qui oublie la clause commune, au
 * milieu de plusieurs qui l'appliquent.
 */
describe('Aperçu des dossiers affectés', () => {
  /**
   * L'aperçu et la liste doivent montrer le MÊME périmètre.
   *
   * ⚠️ L'aperçu ne regardait que `dossier_affectations`, sans appliquer `perimetreDossiers()` —
   * la clause que tout le reste de l'écran applique. Un compte affecté à un dossier qu'il n'a pas
   * le droit de lire s'en voyait donc présenter la référence, la catégorie et le statut, sur un
   * écran d'où la liste et la fiche lui étaient pourtant refusées ; chaque ligne menait de
   * surcroît vers une page répondant « introuvable ».
   *
   * C'est la forme la plus tenace du défaut : une seule requête qui oublie la clause commune, au
   * milieu de plusieurs qui l'appliquent.
   *
   * Le cas porte sur la RÈGLE, et non sur la configuration d'un rôle donné. Une version
   * antérieure affirmait qu'un administrateur digital ne voit aucun dossier (DT-02) : c'était
   * vrai le matin même, et faux l'après-midi — ses habilitations avaient changé en base. Un cas
   * qui décrit l'état du moment finit toujours par accuser à tort.
   */
  it('ne montre jamais un dossier hors du périmètre de son lecteur', async () => {
    /*
      ⚠️ TOUS LES COMPTES ACTIFS, et non plus ceux qui portent une affectation.

      Plus rien n'est affecté depuis le 2026-09-20 : la charge se déduit de l'habilitation et du
      rattachement. Chercher les porteurs d'affectation ne ramenait plus personne, et ce cas —
      qui vérifie que l'aperçu ne déborde jamais du périmètre — ne s'exécutait plus du tout.
    */
    const porteurs = await prisma.users.findMany({
      where: { actif: true },
      select: { id: true, name: true },
    })

    expect(porteurs.length, 'aucun compte actif : le cas ne prouverait rien').toBeGreaterThan(0)

    let apercusExamines = 0

    for (const porteur of porteurs) {
      const utilisateur = await chargerUtilisateurAutorise(porteur.id)
      if (!utilisateur) continue

      for (const d of await dossiersATraiter(utilisateur)) {
        apercusExamines++

        const dansLePerimetre = await prisma.dossiers.count({
          where: { AND: [perimetreDossiers(utilisateur), { id: d.id }] },
        })

        expect(
          dansLePerimetre,
          `${porteur.name} : ${d.reference} affiché alors que la liste le refuserait`
        ).toBe(1)
      }
    }

    expect(
      apercusExamines,
      'aucun aperçu n’a de ligne : le croisement ne prouverait rien'
    ).toBeGreaterThan(0)
  })

  it('ne montre rien à qui n’a aucun droit de lecture, malgré ses affectations', async () => {
    /*
      Le cas que le défaut produisait réellement.

      On part d'un compte qui PORTE des affectations, et on lui retire tout droit de lecture — en
      mémoire seulement, la base n'est pas touchée. Sans la clause de périmètre, l'aperçu lui
      renvoie ses dossiers ; avec elle, rien.
    */
    const porteur = await prisma.users.findFirst({
      where: {
        actif: true,
        dossier_affectations_dossier_affectations_user_idTousers: { some: { actif: true } },
      },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })

    if (!porteur) return

    const affectations = await prisma.dossier_affectations.count({
      where: { user_id: porteur.id, actif: true },
    })

    // Le compte tel qu'il est, moins tout droit sur les dossiers : c'est la situation d'un
    // administrateur au sens de DT-02, quelle que soit la configuration du moment.
    const sansDroitDeLecture = {
      ...utilisateurAvecRoles('administrateur_digital'),
      id: porteur.id,
      permissions: new Set<never>(),
      roles: [],
    }

    expect(
      await dossiersATraiter(sansDroitDeLecture),
      `${porteur.name} porte ${affectations} affectation(s) : aucune ne doit s’afficher sans droit de lecture`
    ).toEqual([])
  })
})
