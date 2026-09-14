import { describe, expect, it } from 'vitest'
import { schemaParcours } from '../formulaire-parcours'
import { PARCOURS } from '@/server/services/declaration/parcours-config'

/**
 * « Autre » oblige à préciser — côté SERVEUR.
 *
 * Le formulaire ne rend le champ libre que lorsque « Autre » est retenu, mais un appel direct
 * n'en passe pas par lui. C'est ce schéma qui décide, et lui seul.
 */
const SOCLE = {
  anonymat: false,
  categorieId: '1',
  description: 'Une description factuelle suffisamment longue pour passer.',
  horodatageAffichage: 0,
  nomPrenom: 'Awa Koffi',
  ville: 'Abidjan',
  dateSurvenance: '2026-09-01',
  lieu: 'Station de Yopougon',
  caractereRepetitif: 'premiere_fois',
}

const analyser = (valeurs: Record<string, unknown>) =>
  schemaParcours(PARCOURS.grief_communaute, false).safeParse({ ...SOCLE, ...valeurs })

describe('La précision est exigée quand « autre » est choisi', () => {
  it('refuse « autre » sans saisie libre', () => {
    const r = analyser({ statutPlaignant: 'autre' })

    expect(r.success, 'une plainte « autre » passe sans être précisée').toBe(false)
    if (!r.success) {
      // ⚠️ L'erreur doit porter sur le champ à REMPLIR, pas sur la liste : c'est là que l'œil la
      // cherche, et c'est là qu'on agit.
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('statutPlaignantPrecision')
    }
  })

  it('accepte « autre » accompagné de sa saisie', () => {
    expect(analyser({ statutPlaignant: 'autre', statutPlaignantPrecision: 'Pêcheur' }).success).toBe(
      true
    )
  })

  it('n’exige RIEN quand une autre valeur est retenue', () => {
    // La contrepartie : la règle est conditionnelle. L'appliquer partout réclamerait une précision
    // pour un champ que l'écran ne montre même pas.
    expect(analyser({ statutPlaignant: 'riverain' }).success).toBe(true)
  })

  it('laisse passer une précision surnuméraire, que le stockage écartera', () => {
    /*
      Un navigateur peut avoir gardé la saisie d'un « autre » abandonné pour « riverain ». Le
      schéma ne s'en offusque pas — refuser produirait une erreur incompréhensible sur un champ
      invisible. C'est `traiterSoumission()` qui la jette, en confrontant la précision à la valeur
      réellement retenue.
    */
    expect(
      analyser({ statutPlaignant: 'riverain', statutPlaignantPrecision: 'résidu' }).success
    ).toBe(true)
  })
})
