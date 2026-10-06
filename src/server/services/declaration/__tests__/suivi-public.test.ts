import { describe, expect, it } from 'vitest'
import { etapesAVenir, historiquePublic, parcoursPublicType } from '../suivi-public'

/**
 * Les étapes montrées au déclarant ne doivent JAMAIS trahir les transitions internes (RGI-10).
 *
 * L'investigation, l'attente d'information et les actions correctives partagent un même libellé
 * affiché : trois lignes « En traitement » à trois dates diraient au déclarant ce que le libellé
 * cache.
 */
const depot = new Date('2026-10-01T09:15:00Z')
const le = (iso: string) => new Date(iso)

/** Reflet du référentiel livré. */
const STATUTS = [
  { libelle_affiche: 'Reçu', ordre: 1, actif: true },
  { libelle_affiche: 'Reçu', ordre: 2, actif: false },
  { libelle_affiche: 'En cours d’analyse', ordre: 3, actif: true },
  { libelle_affiche: 'En traitement', ordre: 4, actif: true },
  { libelle_affiche: 'En traitement', ordre: 5, actif: false },
  { libelle_affiche: 'En traitement', ordre: 6, actif: true },
  { libelle_affiche: 'Résolu', ordre: 7, actif: true },
  { libelle_affiche: 'Clôturé', ordre: 8, actif: true },
  { libelle_affiche: 'En traitement', ordre: 9, actif: true },
  { libelle_affiche: 'Clôturé', ordre: 10, actif: true },
]

describe('Historique public du suivi', () => {
  it('fusionne les étapes consécutives au même libellé, datées de la première', () => {
    const etapes = historiquePublic(
      depot,
      [
        { libelle: 'Reçu', le: depot },
        { libelle: 'En cours d’analyse', le: le('2026-10-02T08:00:00Z') },
        { libelle: 'En traitement', le: le('2026-10-02T10:00:00Z') },
        { libelle: 'En traitement', le: le('2026-10-03T11:00:00Z') },
        { libelle: 'En traitement', le: le('2026-10-04T12:00:00Z') },
      ],
      'En traitement'
    )

    expect(etapes.map((e) => e.libelle)).toEqual(['Reçu', 'En cours d’analyse', 'En traitement'])
    expect(etapes[2].le).toBe('2026-10-02T10:00:00.000Z')
  })

  it('montre au moins l’état actuel d’un dossier sans historique', () => {
    expect(historiquePublic(depot, [], 'Reçu')).toEqual([
      { libelle: 'Reçu', le: depot.toISOString() },
    ])
  })
})

describe('Étapes à venir', () => {
  const type = parcoursPublicType(STATUTS)

  it('déduit un parcours type sans doublon ni statut désactivé', () => {
    expect(type).toEqual(['Reçu', 'En cours d’analyse', 'En traitement', 'Résolu', 'Clôturé'])
  })

  it('annonce ce qui suit l’état actuel', () => {
    expect(etapesAVenir('En cours d’analyse', type, false)).toEqual([
      'En traitement',
      'Résolu',
      'Clôturé',
    ])
  })

  it('n’annonce rien pour un dossier terminé, même rejeté avant traitement', () => {
    expect(etapesAVenir('Clôturé', type, true)).toEqual([])
  })

  it('n’invente pas de suite pour un état hors du parcours type', () => {
    expect(etapesAVenir('Libellé inconnu', type, false)).toEqual([])
  })
})
