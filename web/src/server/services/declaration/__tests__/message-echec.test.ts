import { afterEach, describe, expect, it, vi } from 'vitest'
import { indiceDeveloppement } from '../soumission'

/**
 * Ce que dit l'écran quand l'enregistrement échoue.
 *
 * Le message était « merci de réessayer », et la cause ne partait QUE dans le terminal du
 * serveur. Qui remplissait le formulaire réessayait, obtenait la même chose, et n'avait aucun
 * moyen de savoir que rien ne changerait — c'est arrivé deux fois, pour la même raison : un
 * serveur de développement démarré AVANT une migration garde le client Prisma d'alors.
 *
 * ⚠️ Ce qui est vérifié ici compte dans LES DEUX SENS : la cause doit apparaître en
 * développement, et ne JAMAIS apparaître en production. Ce formulaire est la surface la plus
 * exposée de l'application.
 */
const PRISMA_PERIME = new Error(
  'Invalid `prisma.dossiers.create()` invocation\nUnknown argument `poste_precision`.'
)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('En production, rien ne filtre', () => {
  it('⚠️ ne rend RIEN, quelle que soit la panne', () => {
    vi.stubEnv('NODE_ENV', 'production')

    // Un message d'erreur de base de données révélerait des noms de colonnes et la forme des
    // requêtes, sur le formulaire public le plus exposé de l'application.
    expect(indiceDeveloppement(PRISMA_PERIME)).toBe('')
    expect(indiceDeveloppement(new Error('connect ECONNREFUSED 10.0.0.4:5432'))).toBe('')
    expect(indiceDeveloppement('une chaîne quelconque')).toBe('')
  })
})

describe('En développement, la cause est nommée', () => {
  it('désigne le client Prisma périmé et le geste correctif', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const indice = indiceDeveloppement(PRISMA_PERIME)

    expect(indice, 'le piège n’est pas reconnu').toContain('ANTÉRIEUR')
    expect(indice, 'le geste correctif n’est pas indiqué').toContain('npm run dev')
    expect(indice, 'la cause brute manque').toContain('Unknown argument')
  })

  it('ne retient que la PREMIÈRE ligne de la cause', () => {
    // Les erreurs Prisma tiennent sur trente lignes, dont l'essentiel est en tête. Les déverser
    // dans une alerte la rendrait illisible ; le détail complet part déjà dans le terminal.
    vi.stubEnv('NODE_ENV', 'development')

    const indice = indiceDeveloppement(new Error('Première ligne\nseconde\ntroisième'))

    expect(indice).toContain('Première ligne')
    expect(indice, 'le message entier a été déversé').not.toContain('troisième')
  })

  it('rend la cause d’une panne ordinaire, sans crier au client périmé', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const indice = indiceDeveloppement(new Error('connect ECONNREFUSED 10.0.0.4:5432'))

    expect(indice).toContain('ECONNREFUSED')
    expect(indice, 'un diagnostic erroné est proposé').not.toContain('ANTÉRIEUR')
  })

  it('supporte ce qui n’est pas une Error', () => {
    // Un `throw 'chaîne'` ne doit pas faire tomber la gestion d'erreur elle-même.
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => indiceDeveloppement({ bizarre: true })).not.toThrow()
  })
})
