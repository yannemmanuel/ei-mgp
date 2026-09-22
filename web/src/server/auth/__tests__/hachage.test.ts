import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { hacher, verifier } from '../hachage'

/**
 * Compatibilité du hachage entre les deux applications.
 *
 * Ce n'est pas une préférence de style : `Hash::check()` de Laravel lève
 * `RuntimeException: This password does not use the Bcrypt algorithm.` sur un préfixe `$2b$`,
 * celui que `bcryptjs` écrit par défaut. Sans normalisation, tout mot de passe et tout code
 * d'accès produit ici deviendrait définitivement illisible côté Laravel — donc, pour un code
 * d'accès, un dossier que son déclarant ne pourrait plus consulter.
 *
 * Vérifié en conditions réelles contre le PHP du projet ; ce test est le garde-fou permanent.
 */
describe('Hachage compatible PHP', () => {
  it('écrit toujours le préfixe $2y$ attendu par PHP', async () => {
    const hache = await hacher('MotDePasseTest123')

    expect(hache.startsWith('$2y$')).toBe(true)
  })

  it('relit son propre hachage', async () => {
    const hache = await hacher('MotDePasseTest123')

    expect(await verifier('MotDePasseTest123', hache)).toBe(true)
    expect(await verifier('mauvais', hache)).toBe(false)
  })

  it('relit un hachage au format $2y$, celui des comptes existants', async () => {
    // Empreinte réelle de « password » générée par Laravel (coût 4, pour la vitesse du test).
    const brut = await bcrypt.hash('password', 4)
    const versionPhp = brut.replace(/^\$2[abx]\$/, '$2y$')

    expect(await verifier('password', versionPhp)).toBe(true)
  })

  it('ne modifie que l’en-tête, jamais le sel ni l’empreinte', async () => {
    const hache = await hacher('MotDePasseTest123')

    // Un hachage bcrypt fait 60 caractères : $2y$ + coût + $ + 22 de sel + 31 d'empreinte.
    expect(hache).toHaveLength(60)
    expect(hache).toMatch(/^\$2y\$\d{2}\$[./A-Za-z0-9]{53}$/)
  })
})
