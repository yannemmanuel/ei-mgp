import { describe, expect, it } from 'vitest'
import {
  PARCOURS_CODES,
  parcoursAutorises,
  parcoursDuRole,
  peutVoirParcours,
} from '../parcours'
import { utilisateurAvecParcours } from './aide'

/**
 * L'habilitation par parcours, attribuée personne par personne.
 *
 * La règle métier : « un correspondant MGP ne voit pas tous les griefs, il ne voit que ceux du
 * parcours où il est habilité, et pour chaque grief on a une personne différente ». Le rôle ne
 * suffit donc plus — trois comptes portant `correspondant_mgp` doivent pouvoir voir trois choses
 * différentes.
 *
 * Deux verrous en série, et les cas ci-dessous les exercent séparément : le rôle doit ouvrir le
 * parcours, ET le parcours doit avoir été confié. Un seul des deux ne donne rien.
 */
describe('Le rôle seul ne suffit plus', () => {
  it('ne montre RIEN à qui n’a reçu aucun parcours', () => {
    // L'état d'un compte qu'on vient de créer : un rôle, aucune attribution. C'est l'arbitrage
    // retenu — « il doit être obligatoirement habilité sur un parcours pour avoir accès ».
    const neuf = utilisateurAvecParcours([], 'correspondant_mgp')

    expect(parcoursAutorises(neuf)).toEqual([])
    for (const parcours of PARCOURS_CODES) {
      expect(peutVoirParcours(neuf, parcours), `${parcours} reste visible sans attribution`).toBe(
        false
      )
    }
  })

  it('sépare deux personnes portant le MÊME rôle', () => {
    // Le cas qui motive tout le changement. Avant, ces deux comptes voyaient exactement la même
    // chose : `correspondant_mgp` ouvrait les trois parcours de grief à quiconque le portait.
    const employes = utilisateurAvecParcours(['grief_employe'], 'correspondant_mgp')
    const communaute = utilisateurAvecParcours(['grief_communaute'], 'correspondant_mgp')

    expect(parcoursAutorises(employes)).toEqual(['grief_employe'])
    expect(parcoursAutorises(communaute)).toEqual(['grief_communaute'])

    expect(peutVoirParcours(employes, 'grief_communaute')).toBe(false)
    expect(peutVoirParcours(communaute, 'grief_employe')).toBe(false)
  })
})

describe('L’attribution seule ne suffit pas non plus', () => {
  it('n’ouvre pas un parcours que le rôle ne couvre pas', () => {
    // Un RQSE ne traite que les événements indésirables. Lui confier un parcours de grief — par
    // erreur, ou en recopiant une autre fiche — ne doit rien lui ouvrir de plus.
    const rqse = utilisateurAvecParcours(['ei_employe', 'grief_employe'], 'rqse')

    expect(parcoursAutorises(rqse)).toEqual(['ei_employe'])
    expect(peutVoirParcours(rqse, 'grief_employe')).toBe(false)
  })

  it('ne donne rien à un rôle qui n’ouvre aucun dossier', () => {
    // `agent_relais` ne fait que saisir : aucune attribution ne doit lui ouvrir de dossier.
    const relais = utilisateurAvecParcours([...PARCOURS_CODES], 'agent_relais')

    expect(parcoursAutorises(relais)).toEqual([])
  })
})

describe('Les rôles transverses gardent leur vue d’ensemble', () => {
  it.each(['service_mgp', 'dg', 'auditeur', 'dpo'] as const)(
    '%s voit les 4 parcours sans aucune attribution',
    (role) => {
      // Sans cette exception, un dossier dont le parcours n'est confié à personne deviendrait
      // invisible de TOUS — y compris de l'auditeur chargé de vérifier qu'on le traite.
      const transverse = utilisateurAvecParcours([], role)

      expect(parcoursAutorises(transverse)).toEqual([...PARCOURS_CODES])
      for (const parcours of PARCOURS_CODES) {
        expect(peutVoirParcours(transverse, parcours)).toBe(true)
      }
    }
  )
})

describe('Ce qu’un rôle permet de confier', () => {
  it('décrit le rôle sans rien savoir de l’attribution', () => {
    // `parcoursDuRole` sert à borner ce qu'un administrateur peut cocher, et à nommer qui doit
    // agir sur une fiche. Il répond sur le RÔLE, là où `parcoursAutorises` répond sur la personne.
    expect(parcoursDuRole(['correspondant_mgp']).sort()).toEqual([
      'grief_communaute',
      'grief_employe',
      'grief_sous_traitant',
    ])
    expect(parcoursDuRole(['rqse'])).toEqual(['ei_employe'])
    expect(parcoursDuRole(['agent_relais'])).toEqual([])
    expect(parcoursDuRole(['service_mgp'])).toEqual([...PARCOURS_CODES])
  })

  it('cumule les parcours de plusieurs rôles', () => {
    const cumul = parcoursDuRole(['rqse', 'captage_grief_communaute']).sort()

    expect(cumul).toEqual(['ei_employe', 'grief_communaute'])
  })
})
