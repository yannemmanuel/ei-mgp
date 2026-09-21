import { describe, expect, it } from 'vitest'
import { peutVoirDossier, type DossierPourAutorisation } from '../policies/dossier'
import { cloisonnePourSesRoles, donneAccesAuxDossiers, siteCloisonnant, siteManquant } from '../site'
import { ROLES, type RoleLivre } from '../roles'
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

const dossier = (siteId: bigint | null, directionId: bigint | null = null): DossierPourAutorisation => ({
  parcoursCode: 'ei_employe',
  statutCode: 'en_analyse',
  isAnonymous: true,
  declarantUserId: null,
  siteId,
  directionId,
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
    expect(siteManquant(u.cloisonneParRattachement, u.siteId)).toBe(true)
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
  /*
    ⚠️ LA LISTE DES RÔLES CLOISONNÉS A QUITTÉ LE CODE le 2026-09-21 : elle se coche dans les
    habilitations, et `habilitation-parcours.test.ts` compare le reflet de test à la base. Ce qui
    reste à vérifier ICI, c'est la RÈGLE — comment plusieurs rôles se combinent — car c'est elle
    qui décide de dossiers, et elle ne se lit dans aucun écran.
  */
  const roleFictif = (cloisonne: boolean, donneAcces: boolean) => ({ cloisonne, donneAcces })

  it('⚠️ borne un compte seulement si TOUS ses rôles porteurs le prévoient', () => {
    // Cumuler « Secrétaire CSST » et « Correspondant MGP », ce n'est pas être deux fois restreint :
    // c'est porter un mandat plus large. La version paramétrée a d'abord rendu cette règle par un
    // « au moins un », ce qui retire des dossiers au lieu d'en ajouter.
    expect(cloisonnePourSesRoles([roleFictif(true, true)])).toBe(true)
    expect(cloisonnePourSesRoles([roleFictif(true, true), roleFictif(true, true)])).toBe(true)
    expect(cloisonnePourSesRoles([roleFictif(true, true), roleFictif(false, true)])).toBe(false)
  })

  it('⚠️ ignore un rôle qui ne donne accès à AUCUN dossier', () => {
    // `agent_relais` ne donne accès à rien : il ne desserre rien, mais il ne doit rien desserrer
    // non plus. Le compter parmi les porteurs lèverait le cloisonnement d'un secrétaire qui
    // saisit aussi des déclarations pour autrui.
    expect(cloisonnePourSesRoles([roleFictif(true, true), roleFictif(false, false)])).toBe(true)

    // Et un compte qui n'a QUE des rôles sans accès n'est pas borné : il n'a rien à voir.
    expect(cloisonnePourSesRoles([roleFictif(false, false)])).toBe(false)
    expect(cloisonnePourSesRoles([])).toBe(false)
  })

  it('reconnaît les trois droits qui font un porteur d’accès', () => {
    // Lu dans les permissions, jamais dans le nom du rôle — c'est tout l'objet de la bascule.
    expect(donneAccesAuxDossiers(ROLES.secretaire_csst as readonly string[])).toBe(true)
    expect(donneAccesAuxDossiers(ROLES.service_mgp as readonly string[])).toBe(true)
    expect(donneAccesAuxDossiers(ROLES.employe_declarant as readonly string[])).toBe(true)

    expect(donneAccesAuxDossiers(ROLES.agent_relais as readonly string[])).toBe(false)
    expect(donneAccesAuxDossiers(ROLES.administrateur_digital as readonly string[])).toBe(false)
  })

  it('⚠️ le reflet de test dit la même chose que la règle, rôle par rôle', () => {
    /*
      Les cas de ce fichier se jouent sur des comptes fabriqués par `aide.ts`. Ils ne prouvent
      quelque chose que si le reflet applique la même combinaison que l'application.
    */
    for (const role of Object.keys(ROLES)) {
      const u = utilisateurAvecRoles(role)

      const attendu = cloisonnePourSesRoles([
        {
          cloisonne: u.cloisonneParRattachement,
          donneAcces: donneAccesAuxDossiers(ROLES[role as RoleLivre] as readonly string[]),
        },
      ])

      // Un rôle seul : le reflet et la règle doivent coïncider exactement.
      expect(u.cloisonneParRattachement, `${role}`).toBe(attendu)
    }
  })

  it('s’ajoute au parcours, ne le remplace pas', () => {
    // Un secrétaire de Yopougon ne voit pas un grief de Yopougon : le parcours l'écarte d'abord.
    const u = utilisateurDuSite(YOPOUGON, 'secretaire_csst')

    expect(peutVoirDossier(u, { ...dossier(YOPOUGON), parcoursCode: 'grief_employe' })).toBe(false)
    expect(peutVoirDossier(u, dossier(YOPOUGON))).toBe(true)
  })
})
