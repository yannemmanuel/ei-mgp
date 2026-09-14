import { describe, expect, it } from 'vitest'
import { indiceClientPerime } from '../soumission'

/**
 * Ce que dit l'écran quand l'enregistrement échoue — et ce qu'il ne dit JAMAIS.
 *
 * Le message a un temps porté la cause en développement. C'était utile à qui débogue et déplacé
 * pour qui déclare : le formulaire est public, et une personne qui vient signaler un accident n'a
 * que faire d'un nom de colonne. Le diagnostic est parti dans la console du serveur, où il
 * s'adresse à quelqu'un.
 */
const PRISMA_PERIME = new Error(
  'Invalid `prisma.dossiers.create()` invocation\nUnknown argument `direction_declarant_id`.'
)

describe('⚠️ Le message affiché ne porte AUCUN détail technique', () => {
  it('est écrit en dur, sans rien concaténer', async () => {
    /*
      Vérifié sur la source, faute de pouvoir exécuter `traiterSoumission()` — elle exige un
      contexte de requête HTTP. Ce qui compte ici n'est pas le texte mais son ISOLEMENT : aucune
      expression, aucune variable, aucun appel ne doit venir s'y ajouter.
    */
    const { readFile } = await import('node:fs/promises')
    const source = await readFile('src/server/services/declaration/soumission.ts', 'utf8')

    const attendu =
      '"Votre déclaration n\'a pas pu être enregistrée. Aucune donnée n\'a été perdue : merci de réessayer.",'

    expect(source, 'le message n’est plus rendu tel quel').toContain(attendu)

    // Le piège précis qu'on refuse de revoir : une concaténation qui rouvrirait la fuite.
    expect(source, 'un diagnostic est de nouveau collé au message').not.toMatch(
      /merci de r[ée]essayer\."\s*\+/
    )
  })

  it('ne mentionne le client périmé que dans un `console`', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile('src/server/services/declaration/soumission.ts', 'utf8')

    const appel = source.indexOf('indiceClientPerime(erreur)')
    const ligne = source.slice(source.lastIndexOf('\n', appel), source.indexOf('\n', appel))

    expect(appel, 'le diagnostic n’est plus produit du tout').toBeGreaterThan(0)
    expect(ligne, 'le diagnostic a repris le chemin de l’écran').toContain('const indice =')
    expect(source).toContain('console.warn(indice)')
  })
})

describe('Le diagnostic reconnaît le client Prisma périmé', () => {
  it('le nomme et donne le geste correctif', () => {
    const indice = indiceClientPerime(PRISMA_PERIME)

    expect(indice, 'le piège n’est pas reconnu').not.toBeNull()
    expect(indice).toContain('ANTÉRIEUR')
    expect(indice, 'le geste correctif manque').toContain('npm run dev')
  })

  it('retient la ligne qui NOMME le champ, pas la première', () => {
    // Une erreur Prisma s'ouvre sur « Invalid `prisma.dossiers.create()` invocation » et garde le
    // nom du champ pour plus bas. Prendre la première afficherait ce qui n'apprend rien.
    const indice = indiceClientPerime(PRISMA_PERIME)

    expect(indice).toContain('direction_declarant_id')
    expect(indice, 'le générique a été retenu à la place').not.toContain('invocation')
  })

  it('se tait sur une panne d’une autre nature', () => {
    // L'erreur brute est déjà journalisée juste avant : proposer un diagnostic faux serait pire
    // que n'en proposer aucun.
    expect(indiceClientPerime(new Error('connect ECONNREFUSED 10.0.0.4:5432'))).toBeNull()
    expect(indiceClientPerime('une chaîne quelconque')).toBeNull()
  })

  it('supporte ce qui n’est pas une Error', () => {
    // Un `throw {}` ne doit pas faire tomber la gestion d'erreur elle-même.
    expect(() => indiceClientPerime({ bizarre: true })).not.toThrow()
  })
})
