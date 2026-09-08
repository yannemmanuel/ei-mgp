import { describe, expect, it } from 'vitest'
import { peutVoirDossier, type DossierPourAutorisation } from '../policies/dossier'
import { estCloisonneParSite, siteCloisonnant, siteManquant } from '../site'
import { utilisateurAvecRoles, utilisateurDuSite } from './aide'

/**
 * Cloisonnement par site.
 *
 * « Un secrétaire est habilité par site, et sur un site on peut avoir une ou plusieurs
 * directions. » Le site d'un dossier découle de la direction concernée ; il s'ajoute au
 * cloisonnement par parcours sans le remplacer.
 */
const YOPOUGON = 1n
const SIEGE = 2n

const dossier = (siteId: bigint | null): DossierPourAutorisation => ({
  parcoursCode: 'ei_employe',
  statutCode: 'affecte',
  isAnonymous: true,
  declarantUserId: null,
  siteId,
  estAffecteAuLecteur: true,
})

describe('Qui est cloisonné', () => {
  it('borne un secrétaire à son site', () => {
    const u = utilisateurDuSite(YOPOUGON, 'secretaire_csst')

    expect(siteCloisonnant(u)).toBe(YOPOUGON)
    expect(peutVoirDossier(u, dossier(YOPOUGON))).toBe(true)
    expect(peutVoirDossier(u, dossier(SIEGE))).toBe(false)
  })

  it('cache le dossier dont la direction n’est rattachée à aucun site', () => {
    // Décision assumée : un dossier sans site n'est vu d'aucun rôle cloisonné. Le rendre visible
    // à tous annulerait le cloisonnement au premier référentiel incomplet.
    const u = utilisateurDuSite(YOPOUGON, 'secretaire_csst')

    expect(peutVoirDossier(u, dossier(null))).toBe(false)
  })

  it('ne restreint pas un compte sans site', () => {
    // Un oubli de paramétrage ne doit pas vider l'écran d'un compte qui travaillait la veille :
    // il est signalé dans la console des comptes, pas transformé en refus silencieux.
    const u = utilisateurAvecRoles('secretaire_csst')

    expect(siteCloisonnant(u)).toBeNull()
    expect(peutVoirDossier(u, dossier(SIEGE))).toBe(true)
    expect(siteManquant(u.roles, u.siteId)).toBe(true)
  })

  it('ne restreint pas un accès transverse', () => {
    for (const role of ['service_mgp', 'dg', 'dpo', 'auditeur'] as const) {
      expect(siteCloisonnant(utilisateurDuSite(YOPOUGON, role)), role).toBeNull()
    }
  })

  it('ne restreint pas un cumul avec un rôle non cloisonné', () => {
    // Cumuler « Secrétaire CSST » et « Correspondant MGP », ce n'est pas être deux fois restreint :
    // c'est porter un mandat plus large. Restreindre alors retirerait des dossiers que le second
    // rôle donne le droit de voir.
    const u = utilisateurDuSite(YOPOUGON, 'secretaire_csst', 'correspondant_mgp')

    expect(siteCloisonnant(u)).toBeNull()
  })
})

describe('Périmètre du cloisonnement', () => {
  it('couvre exactement les cinq rôles décidés', () => {
    const cloisonnes = (
      [
        'employe_declarant',
        'agent_relais',
        'secretaire_csst',
        'rqse',
        'rgp',
        'responsable_grief_employe',
        'correspondant_mgp',
        'service_mgp',
        'comite_ethique',
        'captage_grief_communaute',
        'captage_grief_soustraitant',
        'dg',
        'dpo',
        'administrateur_digital',
        'auditeur',
      ] as const
    ).filter(estCloisonneParSite)

    expect(cloisonnes).toEqual([
      'secretaire_csst',
      'rqse',
      'rgp',
      'captage_grief_communaute',
      'captage_grief_soustraitant',
    ])
  })

  it('s’ajoute au parcours, ne le remplace pas', () => {
    // Un secrétaire de Yopougon ne voit pas un grief de Yopougon : le parcours l'écarte d'abord.
    const u = utilisateurDuSite(YOPOUGON, 'secretaire_csst')

    expect(peutVoirDossier(u, { ...dossier(YOPOUGON), parcoursCode: 'grief_employe' })).toBe(false)
    expect(peutVoirDossier(u, dossier(YOPOUGON))).toBe(true)
  })
})
