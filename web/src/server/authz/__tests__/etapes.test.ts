import { describe, expect, it } from 'vitest'
import { PARCOURS_CODES } from '../parcours'
import { ROLES, type Role } from '../roles'
import { acteursDeLEtape, peutFaireAvancerDepuis } from '../etapes'
import { peutChangerStatutDossier, type DossierPourAutorisation } from '../policies/dossier'
import { STATUTS, type StatutCode } from '@/server/services/dossier/statuts'
import { utilisateurAvecRoles } from './aide'

/**
 * Acteurs par étape (docs/workflows.md §3).
 *
 * Le graphe des transitions contraignait l'enchaînement des états, jamais QUI les franchit :
 * n'importe quel porteur de `dossiers.status.update` pouvait pousser seul un dossier de « Reçu »
 * à « Résolu », y compris à des étapes confiées à d'autres acteurs par le CDC.
 */
const dossier = (
  parcoursCode: DossierPourAutorisation['parcoursCode'],
  statutCode: StatutCode
): DossierPourAutorisation => ({
  parcoursCode,
  statutCode,
  isAnonymous: true,
  declarantUserId: null,
  estAffecteAuLecteur: false,
})

describe('Table des acteurs', () => {
  it('ne désigne que des rôles qui existent', () => {
    // Une faute de frappe dans un slug ne lèverait aucune erreur : elle rendrait simplement
    // l'étape infranchissable pour tout le monde, et le dossier resterait bloqué sans explication.
    for (const parcours of PARCOURS_CODES) {
      for (const statut of STATUTS) {
        for (const role of acteursDeLEtape(parcours, statut) ?? []) {
          expect(Object.keys(ROLES), `${parcours}/${statut}`).toContain(role)
        }
      }
    }
  })

  it('laisse passer les étapes que le CDC n’attribue à personne', () => {
    // « Responsable identifié », « DL », « Équipe dédiée » et « Déclarant ou tiers » n'ont pas de
    // rôle applicatif. Leur inventer une correspondance bloquerait du travail légitime au nom
    // d'une règle que personne n'a écrite : l'absence de désignation vaut absence de restriction.
    expect(acteursDeLEtape('ei_employe', 'en_investigation')).toBeNull()
    expect(peutFaireAvancerDepuis(['secretaire_csst'], 'ei_employe', 'en_investigation')).toBe(true)
  })

  it('réserve la relance après réouverture au Service MGP et à la DG (RG-07)', () => {
    for (const parcours of PARCOURS_CODES) {
      expect(peutFaireAvancerDepuis(['service_mgp'], parcours, 'reouvert')).toBe(true)
      expect(peutFaireAvancerDepuis(['dg'], parcours, 'reouvert')).toBe(true)
      expect(peutFaireAvancerDepuis(['correspondant_mgp'], parcours, 'reouvert')).toBe(false)
      expect(peutFaireAvancerDepuis(['secretaire_csst'], parcours, 'reouvert')).toBe(false)
    }
  })
})

describe('Une étape appartient à ses acteurs', () => {
  it('interdit au Secrétaire CSST l’analyse préliminaire d’un grief', () => {
    // §6.2 étape 2 confie l'analyse d'un grief employé au DRH, au Correspondant MGP ou au RQSE.
    // Le cloisonnement par parcours l'écarte déjà ici ; l'assertion fige les deux verrous.
    const u = utilisateurAvecRoles('secretaire_csst')

    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'affecte'))).toBe(false)
  })

  it('interdit au DRH de relancer un grief employé depuis l’investigation', () => {
    // §6.2 : le DRH tient les étapes 2 et 3, pas l'étape 5 (DG · Service MGP) — alors qu'il porte
    // `dossiers.status.update` et voit le parcours. C'est exactement ce que la table ajoute.
    const u = utilisateurAvecRoles('responsable_grief_employe')

    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'affecte'))).toBe(true)
    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'en_investigation'))).toBe(false)
  })

  it('applique l’intersection quand les deux documents divergent', () => {
    // `docs/workflows.md` §6.2 cite le RQSE parmi les acteurs de l'analyse d'un grief employé,
    // tandis que `docs/acteurs.md` §2 lui donne « Dossiers ei_employe » — et c'est ce dernier qui
    // est implémenté par `ROLES_PAR_PARCOURS`. Les deux transcriptions restent fidèles à leur
    // source ; c'est leur INTERSECTION qui s'applique, donc la règle la plus étroite.
    const u = utilisateurAvecRoles('rqse')

    expect(acteursDeLEtape('grief_employe', 'affecte')).toContain('rqse')
    expect(peutChangerStatutDossier(u, dossier('grief_employe', 'affecte'))).toBe(false)
    expect(peutChangerStatutDossier(u, dossier('ei_employe', 'affecte'))).toBe(true)
  })

  it('laisse le Correspondant MGP conduire l’enquête sous-traitant de bout en bout', () => {
    // §6.3 : le même acteur tient les étapes 2, 3 et 5 — la restriction ne doit pas le gêner.
    const u = utilisateurAvecRoles('correspondant_mgp')

    for (const statut of ['affecte', 'en_analyse', 'en_investigation'] as const) {
      expect(
        peutChangerStatutDossier(u, dossier('grief_sous_traitant', statut)),
        `étape ${statut}`
      ).toBe(true)
    }
  })

  it('n’ouvre l’affectation manuelle qu’à qui sait affecter', () => {
    // « Reçu → Affecté » est automatique (EX-GES-02). La voie manuelle ne sert qu'au cas où aucun
    // compte actif ne porte le rôle de captage : c'est un geste d'affectation.
    expect(peutChangerStatutDossier(utilisateurAvecRoles('service_mgp'), dossier('ei_employe', 'recu'))).toBe(true)
    expect(peutChangerStatutDossier(utilisateurAvecRoles('rqse'), dossier('ei_employe', 'recu'))).toBe(false)
  })

  it('empêche un seul compte de traverser tout le circuit', () => {
    // Le symptôme rapporté : un dossier poussé seul de « Reçu » à « Résolu ». Aucun rôle ne doit
    // pouvoir franchir toutes les marches d'un parcours.
    const etapes: StatutCode[] = ['recu', 'affecte', 'en_analyse', 'reouvert']

    for (const role of Object.keys(ROLES) as Role[]) {
      const u = utilisateurAvecRoles(role)
      const franchies = etapes.filter((statut) =>
        peutChangerStatutDossier(u, dossier('grief_employe', statut))
      )

      expect(franchies.length, `${role} franchit ${franchies.join(', ')}`).toBeLessThan(etapes.length)
    }
  })
})

describe('Aucune étape ne doit rester sans preneur', () => {
  it('chaque étape désignée a au moins un compte actif capable de la franchir', async () => {
    // Le revers d'une restriction : une étape dont aucun compte actif ne porte le rôle bloque le
    // dossier pour toujours, sans message et sans recours — un défaut pire que la permissivité
    // qu'on vient de corriger. Ce cas lit la base réelle, parce que c'est la CONFIGURATION des
    // comptes qui décide, pas le code.
    const { prisma } = await import('@/lib/prisma')

    const liens = await prisma.model_has_roles.findMany({
      where: { model_type: String.raw`App\Models\User` },
      select: { model_id: true, roles: { select: { name: true, actif: true } } },
    })

    const comptesActifs = new Set(
      (
        await prisma.users.findMany({
          where: { actif: true, id: { in: liens.map((l) => l.model_id) } },
          select: { id: true },
        })
      ).map((u) => u.id)
    )

    // Un rôle désactivé ne confère plus rien : il ne compte pas comme preneur.
    const rolesPortes = new Set(
      liens
        .filter((l) => comptesActifs.has(l.model_id) && l.roles.actif)
        .map((l) => l.roles.name as Role)
    )

    const orphelines: string[] = []

    for (const parcours of PARCOURS_CODES) {
      for (const statut of STATUTS) {
        const acteurs = acteursDeLEtape(parcours, statut)
        if (acteurs === null) continue

        if (!acteurs.some((role) => rolesPortes.has(role))) {
          orphelines.push(`${parcours}/${statut} (attend ${acteurs.join(' ou ')})`)
        }
      }
    }

    expect(orphelines, `étapes sans acteur disponible : ${orphelines.join(' — ')}`).toEqual([])
  })
})
