import { describe, expect, it } from 'vitest'
import { creerCourrielHtml } from '../gabarit-courriel'

describe('Gabarit HTML des courriels', () => {
  it('produit une carte de marque avec un bouton accessible', () => {
    const html = creerCourrielHtml({
      titre: 'Activez votre compte',
      preentete: 'Votre accès est prêt.',
      texte: 'Bonjour Awa,\n\nVotre compte est disponible.',
      etiquette: 'Création de compte',
      action: { libelle: 'Choisir mon mot de passe', url: 'https://example.test/acces/jeton' },
      lienPied: {
        libelle: 'Cliquez ici pour faire une déclaration',
        url: 'https://example.test/declarer',
      },
    })

    expect(html).toContain('Plateforme EI / MGP')
    expect(html).toContain('Choisir mon mot de passe')
    expect(html).toContain('href="https://example.test/acces/jeton"')
    expect(html).toContain('role="presentation"')
    expect(html).toContain('Cliquez ici pour faire une déclaration')
    expect(html).toContain('href="https://example.test/declarer"')
  })

  it('neutralise le HTML injecté par les gabarits administrables', () => {
    const html = creerCourrielHtml({
      titre: '<img src=x onerror=alert(1)>',
      preentete: '<script>alert(1)</script>',
      texte: 'Texte <script>alert(1)</script>',
      action: { libelle: 'Continuer', url: 'javascript:alert(1)' },
    })

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('href="#"')
  })

  it('rend les liens du texte cliquables sans perdre le contenu', () => {
    const html = creerCourrielHtml({
      titre: 'Mise à jour',
      preentete: 'Consultez le dossier.',
      texte: 'Consultez https://example.test/dossiers/123 pour continuer.',
    })

    expect(html).toContain('<a href="https://example.test/dossiers/123')
    expect(html).toContain('pour continuer.')
  })
})
