import { describe, expect, it } from 'vitest'
import { peutVoirDossier, type DossierPourAutorisation } from '../policies/dossier'
import { rattachementCouvre } from '../site'
import { utilisateurAvecRoles } from './aide'

/**
 * Arbres de décision transversaux.
 *
 * Chaque ligne est une feuille métier complète : une condition ajoutée ou retirée doit changer
 * explicitement le résultat attendu, au lieu d'être couverte par hasard dans un scénario long.
 */
describe('Arbre de décision — accès du déclarant à un dossier', () => {
  const utilisateur = utilisateurAvecRoles('employe_declarant')

  it.each([
    { anonyme: false, auteur: utilisateur.id, attendu: true, feuille: 'identifié + auteur' },
    { anonyme: false, auteur: 999_999n, attendu: false, feuille: 'identifié + autre auteur' },
    { anonyme: false, auteur: null, attendu: false, feuille: 'identifié + aucun auteur' },
    { anonyme: true, auteur: utilisateur.id, attendu: false, feuille: 'anonyme + même identifiant' },
    { anonyme: true, auteur: null, attendu: false, feuille: 'anonyme + aucun auteur' },
  ])('$feuille → $attendu', ({ anonyme, auteur, attendu }) => {
    const dossier: DossierPourAutorisation = {
      parcoursCode: 'ei_employe',
      statutCode: 'recu',
      isAnonymous: anonyme,
      declarantUserId: auteur,
      siteId: null,
      directionId: null,
      estAffecteAuLecteur: false,
    }

    expect(peutVoirDossier(utilisateur, dossier)).toBe(attendu)
  })
})

describe('Arbre de décision — couverture site/direction', () => {
  const permissions = new Set<'dossiers.view'>(['dossiers.view'])

  it.each([
    {
      feuille: 'direction autonome + même direction',
      compte: { siteId: null, directionId: 10n },
      dossier: { siteId: null, directionId: 10n },
      attendu: true,
    },
    {
      feuille: 'direction autonome + autre direction',
      compte: { siteId: null, directionId: 10n },
      dossier: { siteId: null, directionId: 11n },
      attendu: false,
    },
    {
      feuille: 'direction rattachée + dossier du même site',
      compte: { siteId: 2n, directionId: 10n },
      dossier: { siteId: 2n, directionId: 11n },
      attendu: true,
    },
    {
      feuille: 'direction rattachée + dossier d’un autre site',
      compte: { siteId: 2n, directionId: 10n },
      dossier: { siteId: 3n, directionId: 10n },
      attendu: false,
    },
    {
      feuille: 'site + dossier sans direction du même site',
      compte: { siteId: 2n, directionId: null },
      dossier: { siteId: 2n, directionId: null },
      attendu: true,
    },
    {
      feuille: 'aucun rattachement + tout dossier',
      compte: { siteId: null, directionId: null },
      dossier: { siteId: 99n, directionId: 999n },
      attendu: true,
    },
  ])('$feuille → $attendu', ({ compte, dossier, attendu }) => {
    expect(
      rattachementCouvre(
        {
          ...compte,
          permissions,
          cloisonneParRattachement: true,
        },
        dossier,
      ),
    ).toBe(attendu)
  })
})

describe('Arbre de décision — une affectation ne contourne pas le type habilité', () => {
  it.each([
    { parcours: 'grief_employe' as const, affecte: false, attendu: false },
    { parcours: 'grief_employe' as const, affecte: true, attendu: true },
    { parcours: 'ei_employe' as const, affecte: true, attendu: false },
  ])('$parcours / affecté=$affecte → $attendu', ({ parcours, affecte, attendu }) => {
    const utilisateur = utilisateurAvecRoles('rgp')
    const dossier: DossierPourAutorisation = {
      parcoursCode: parcours,
      statutCode: 'recu',
      isAnonymous: true,
      declarantUserId: null,
      siteId: null,
      directionId: null,
      estAffecteAuLecteur: affecte,
    }

    expect(peutVoirDossier(utilisateur, dossier)).toBe(attendu)
  })
})
