import { describe, expect, it } from 'vitest'
import { directionCloisonnante, siteCloisonnant, siteManquant } from '../site'
import { peutVoirDossier } from '../policies/dossier'
import type { DossierPourAutorisation } from '../policies/dossier'
import type { UtilisateurAutorise } from '../utilisateur'
import { utilisateurAvecRoles } from './aide'

/**
 * Habilitation par DIRECTION, plus fine que celle par site.
 *
 * « On peut être habilité sur un site, c'est-à-dire plusieurs directions à la fois, ou sur une
 * seule direction. Dans ce cas, on ne reçoit que les déclarations de la direction sur laquelle on
 * est habilité. »
 *
 * Ce cloisonnement s'ajoute à celui par parcours ; il ne le remplace pas.
 */

const SIEGE = 2n
const YOPOUGON = 1n
const RH = 10n
const QHSE = 11n

/** Un compte cloisonné, rattaché au site et/ou à la direction voulus. */
function compte(
  role: Parameters<typeof utilisateurAvecRoles>[0],
  rattachement: { siteId?: bigint | null; directionId?: bigint | null }
): UtilisateurAutorise {
  return {
    ...utilisateurAvecRoles(role),
    siteId: rattachement.siteId ?? null,
    directionId: rattachement.directionId ?? null,
  }
}

const dossier = (
  siteId: bigint | null,
  directionId: bigint | null,
  parcoursCode: DossierPourAutorisation['parcoursCode'] = 'ei_employe'
): DossierPourAutorisation => ({
  parcoursCode,
  statutCode: 'en_analyse',
  isAnonymous: true,
  declarantUserId: null,
  siteId,
  directionId,
  estAffecteAuLecteur: true,
})

describe('Habilitation sur une DIRECTION', () => {
  it('ne montre que les déclarations de cette direction', () => {
    const rh = compte('secretaire_csst', { directionId: RH })

    expect(directionCloisonnante(rh)).toBe(RH)
    expect(peutVoirDossier(rh, dossier(SIEGE, RH)), 'sa propre direction lui est refusée').toBe(true)
    expect(
      peutVoirDossier(rh, dossier(SIEGE, QHSE)),
      'une AUTRE direction du même site lui est montrée'
    ).toBe(false)
  })

  it('⚠️ efface le contrôle par site, qui refuserait des dossiers légitimes', () => {
    /*
      Une direction peut n'être rattachée à aucun site : ses dossiers portent alors `site_id` nul.
      Si les deux contrôles s'appliquaient, le contrôle de site rejetterait ce dossier alors même
      que sa direction correspond — et le compte ne verrait plus rien du tout.
    */
    const rh = compte('secretaire_csst', { siteId: SIEGE, directionId: RH })

    expect(siteCloisonnant(rh), 'le site borne encore un compte borné par sa direction').toBeNull()
    expect(peutVoirDossier(rh, dossier(null, RH))).toBe(true)
  })

  it('⚠️ ne montre AUCUN dossier sans direction', () => {
    /*
      C'est le cas de tous les griefs communautaires et sous-traitants : ils n'ont pas de direction
      concernée. Être habilité sur une direction, c'est être habilité sur ce qui relève d'elle —
      les montrer faute de mieux annulerait le cloisonnement sur ces parcours.
    */
    const rh = compte('secretaire_csst', { directionId: RH })

    expect(peutVoirDossier(rh, dossier(SIEGE, null))).toBe(false)
    expect(peutVoirDossier(rh, dossier(null, null))).toBe(false)
  })

  it('⚠️ l’emporte sur le site quand les deux sont renseignés', () => {
    // L'écran de création l'empêche, mais d'anciennes lignes le portent. Pour un cloisonnement, la
    // bonne erreur est de RESTREINDRE : retenir le site montrerait toutes les autres directions.
    const mixte = compte('secretaire_csst', { siteId: SIEGE, directionId: RH })

    expect(peutVoirDossier(mixte, dossier(SIEGE, QHSE)), 'le site a pris le pas').toBe(false)
    expect(peutVoirDossier(mixte, dossier(SIEGE, RH))).toBe(true)
  })
})

describe('Habilitation sur un SITE', () => {
  it('montre toutes les directions de ce site', () => {
    const duSiege = compte('secretaire_csst', { siteId: SIEGE })

    expect(directionCloisonnante(duSiege)).toBeNull()
    expect(siteCloisonnant(duSiege)).toBe(SIEGE)
    expect(peutVoirDossier(duSiege, dossier(SIEGE, RH))).toBe(true)
    expect(peutVoirDossier(duSiege, dossier(SIEGE, QHSE))).toBe(true)
    expect(peutVoirDossier(duSiege, dossier(YOPOUGON, RH)), 'un autre site lui est montré').toBe(false)
  })

  it('montre les dossiers de son site qui n’ont aucune direction', () => {
    /*
      Le grief communautaire est le cas réel : un riverain ne relève d'aucune direction, et ces
      dossiers portent `direction_id` nul. Un compte de SITE les voit — c'est précisément ce qui
      le distingue d'un compte de direction, qui n'en verra jamais aucun.

      ⚠️ Le parcours doit être un de ceux que le rôle ouvre, sinon le refus viendrait du
      cloisonnement par PARCOURS et ce cas ne prouverait rien du rattachement.
    */
    const duSiege = compte('responsable_mgp_structure', { siteId: SIEGE })

    expect(peutVoirDossier(duSiege, dossier(SIEGE, null, 'grief_communaute'))).toBe(true)
    expect(
      peutVoirDossier(duSiege, dossier(YOPOUGON, null, 'grief_communaute')),
      'un grief d’un autre site lui est montré'
    ).toBe(false)
  })

  it('⚠️ un compte de DIRECTION ne voit aucun grief communautaire', () => {
    // La contrepartie, et elle est voulue : ces dossiers n'ont pas de direction, donc ne relèvent
    // d'aucune habilitation par direction. C'est la conséquence directe de la règle métier.
    const parDirection = compte('responsable_mgp_structure', { directionId: RH })

    expect(peutVoirDossier(parDirection, dossier(SIEGE, null, 'grief_communaute'))).toBe(false)
  })
})

describe('Ce que le rattachement ne borne pas', () => {
  it('laisse passer un accès transverse, direction renseignée ou non', () => {
    const transversal = compte('service_mgp', { directionId: RH })

    expect(directionCloisonnante(transversal)).toBeNull()
    expect(peutVoirDossier(transversal, dossier(YOPOUGON, QHSE))).toBe(true)
  })

  it('⚠️ ne borne pas un compte qui cumule un rôle NON cloisonné', () => {
    /*
      Cumuler n'est pas être deux fois restreint : c'est porter un mandat plus large.

      ⚠️ CETTE RÈGLE A FAILLI SE PERDRE au passage en base. Elle s'écrivait `every` sur les rôles
      portés ; la version paramétrée l'a d'abord rendue par un drapeau levé au premier rôle
      cloisonné — c'est-à-dire un `some`, qui retire à ce compte les dossiers que son second rôle
      lui donne le droit de voir, sans erreur et sans message.
    */
    const cumul: UtilisateurAutorise = {
      ...utilisateurAvecRoles('secretaire_csst', 'correspondant_mgp'),
      siteId: null,
      directionId: RH,
    }

    expect(directionCloisonnante(cumul)).toBeNull()
  })
})

describe('Alerte « rattachement manquant »', () => {
  it('ne se déclenche pas sur un compte habilité sur une direction', () => {
    // Il est borné, et plus étroitement qu'un compte de site : l'alerter serait une fausse alerte,
    // et les fausses alertes font ignorer les vraies.
    expect(siteManquant(true, null, RH)).toBe(false)
  })

  it('se déclenche quand il n’y a ni site ni direction', () => {
    expect(siteManquant(true, null, null)).toBe(true)
  })

  it('ne se déclenche pas sur un rôle non cloisonné', () => {
    expect(siteManquant(false, null, null)).toBe(false)
  })
})
